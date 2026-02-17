export interface DocArticle {
  id: string;
  title: string;
  content: string;
  category: string | null;
  icon: string | null;
  pinned: boolean;
  parentId: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}
