export interface PostItData {
  id: string;
  user_id: string;
  x: number;
  y: number;
  color: string;
  mode: 'draw' | 'text' | 'erase';
  text_content: string | null;
  canvas_content: string | null;
}
