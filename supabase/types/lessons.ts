/** Row type for the `public.lessons` table */
export interface Lesson {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  section_name: string;
  order_index: number;
  created_at: string;
}

/** Payload for inserting a new lesson (id and created_at are auto-generated) */
export type LessonInsert = Omit<Lesson, 'id' | 'created_at'>;

/** Payload for updating an existing lesson (all fields optional) */
export type LessonUpdate = Partial<LessonInsert>;
