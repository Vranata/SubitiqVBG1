export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  imageUrl?: string;
  category?: string;
  price?: number;
  organizedBy?: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  interests?: string[];
}
