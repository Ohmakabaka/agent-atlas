import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";

const topicInputSchema = z.object({
  id: z.string().max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "主题标识使用小写字母、数字和短横线"),
  name: z.string().trim().min(1, "请填写主题名称").max(100),
  englishName: z.string().trim().min(1, "请填写英文名称").max(200),
  description: z
    .string()
    .trim()
    .min(10, "主题概述至少需要 10 个字符")
    .max(10000),
  question: z.string().trim().min(1, "请填写这个主题解决的核心问题").max(500),
  concepts: z.array(z.string().trim().min(1).max(200)).max(50),
  readingPath: z.array(z.string().min(1).max(200)).max(30),
  featured: z.boolean(),
  sortOrder: z.number().int().min(-10000).max(10000),
  parentId: z.string().max(100).nullable(),
});
export type TopicInput = z.infer<typeof topicInputSchema>;

const topicSnapshot = (topic: {
  slug: string;
  name: string;
  englishName: string;
  description: string;
  question: string;
  concepts: Prisma.JsonValue;
  readingPath: Prisma.JsonValue;
  featured: boolean;
  sortOrder: number;
  parentId: string | null;
}) => ({
  slug: topic.slug,
  name: topic.name,
  englishName: topic.englishName,
  description: topic.description,
  question: topic.question,
  concepts: topic.concepts,
  readingPath: topic.readingPath,
  featured: topic.featured,
  sortOrder: topic.sortOrder,
  parentId: topic.parentId,
});

/** All hierarchy and reference checks share the mutation transaction. */
export async function saveTopicRecord(
  input: TopicInput,
  db: PrismaClient = prisma,
) {
  const parsed = topicInputSchema.parse(input);
  const concepts = [...new Set(parsed.concepts)];
  const readingPath = [...new Set(parsed.readingPath)];
  return db.$transaction(async (tx) => {
    const previous = parsed.id
      ? await tx.topic.findUniqueOrThrow({ where: { id: parsed.id } })
      : null;
    if (parsed.parentId === parsed.id && parsed.id)
      throw new Error("主题不能成为自己的父主题");
    // Inspect the entire ancestry to reject both a newly introduced cycle and an existing corrupt chain.
    const visited = new Set<string>(parsed.id ? [parsed.id] : []);
    let ancestorId = parsed.parentId;
    while (ancestorId) {
      if (visited.has(ancestorId))
        throw new Error("父子主题不能形成循环，请选择其他父主题");
      visited.add(ancestorId);
      const ancestor = await tx.topic.findUnique({
        where: { id: ancestorId },
        select: { parentId: true },
      });
      if (!ancestor) throw new Error("所选父主题不存在，请刷新后重试");
      ancestorId = ancestor.parentId;
    }
    if (previous && previous.slug !== parsed.slug) {
      const references = await tx.topic.findUniqueOrThrow({
        where: { id: previous.id },
        include: {
          _count: {
            select: {
              articles: true,
              children: true,
              incoming: true,
              outgoing: true,
            },
          },
        },
      });
      if (Object.values(references._count).some((count) => count > 0))
        throw new Error(
          "已有资料、子主题或知识关系引用此主题，不能修改标识；可修改显示名称",
        );
    }
    if (readingPath.length) {
      const published = await tx.article.findMany({
        where: { slug: { in: readingPath }, status: "published" },
        select: { slug: true },
      });
      const available = new Set(published.map((article) => article.slug));
      const invalid = readingPath.filter((slug) => !available.has(slug));
      if (invalid.length)
        throw new Error(
          `阅读路径仅接受已发布资料，以下标识无效：${invalid.slice(0, 4).join("、")}`,
        );
    }
    const data = {
      slug: parsed.slug,
      name: parsed.name,
      englishName: parsed.englishName,
      description: parsed.description,
      question: parsed.question,
      concepts,
      readingPath,
      featured: parsed.featured,
      sortOrder: parsed.sortOrder,
      parentId: parsed.parentId,
    };
    const saved = previous
      ? await tx.topic.update({ where: { id: previous.id }, data })
      : await tx.topic.create({ data });
    await tx.auditLog.create({
      data: {
        action: previous ? "topic.updated" : "topic.created",
        entityType: "topic",
        entityId: saved.id,
        detail: {
          before: previous ? topicSnapshot(previous) : null,
          after: topicSnapshot(saved),
        } as Prisma.InputJsonValue,
      },
    });
    return saved;
  });
}

export async function deleteTopicRecord(
  id: string,
  confirmation: string,
  db: PrismaClient = prisma,
) {
  return db.$transaction(async (tx) => {
    const topic = await tx.topic.findUniqueOrThrow({
      where: { id },
      include: {
        _count: {
          select: {
            articles: true,
            children: true,
            incoming: true,
            outgoing: true,
          },
        },
      },
    });
    if (confirmation !== topic.slug)
      throw new Error("删除前请准确输入主题标识");
    if (Object.values(topic._count).some((count) => count > 0))
      throw new Error(
        "主题仍有关联资料、子主题或知识关系，请先解除引用；已有内容不会被连带删除",
      );
    await tx.auditLog.create({
      data: {
        action: "topic.deleted",
        entityType: "topic",
        entityId: topic.id,
        detail: { before: topicSnapshot(topic) } as Prisma.InputJsonValue,
      },
    });
    await tx.topic.delete({ where: { id } });
  });
}
