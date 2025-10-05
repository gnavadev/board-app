export interface PostItData {
  id: string
  x: number
  y: number
  mode: 'draw' | 'text'
  content?: string
  color?: string
  ownerId: string
}
