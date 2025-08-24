// app/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from 'next/link';
import { HelpCircle } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listRecentConversations } from '@/lib/db/conversations';

type PrimitiveDate = string | number | Date;

type CardData = {
  id: string | number;
  avatar: string;        // single letter
  username: string;
  platform: string;
  views: number;
  days: number;          // days ago
  related: number;
};

type StatsLike = { views?: number; related?: number } | null;
type UserLike = { name?: string | null } | null;

type ConversationLike = {
  id?: string | number;
  conversationId?: string | number;
  _id?: string | number;
  slug?: string | number;
  username?: string;
  user?: UserLike;
  title?: string;
  name?: string;
  platform?: string;
  model?: string;
  views?: number;
  viewCount?: number;
  stats?: StatsLike;
  related?: number;
  relatedCount?: number;
  createdAt?: PrimitiveDate;
  created_at?: PrimitiveDate;
  updatedAt?: PrimitiveDate;
};

// Fallback data if DB returns nothing
const mockCards: CardData[] = [
  { id: 1, avatar: 'S', username: 'test', platform: 'ChatGPT', views: 25, days: 66, related: 0 },
  { id: 2, avatar: 'P', username: 'test', platform: 'ChatGPT', views: 43, days: 79, related: 0 },
  { id: 3, avatar: 'U', username: 'test', platform: 'Claude',  views: 70, days: 101, related: 0 },
  { id: 4, avatar: 'C', username: 'test', platform: 'ChatGPT', views: 36, days: 88, related: 0 },
  { id: 5, avatar: 'S', username: 'test', platform: 'ChatGPT', views: 24, days: 85, related: 0 },
];

function daysAgo(d?: PrimitiveDate): number {
  if (!d) return 0;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return 0;
  const ms = Date.now() - date.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function toCard(item: ConversationLike): CardData {
  const maybeId = item.id ?? item.conversationId ?? item._id ?? item.slug;
  const id: string | number =
    typeof maybeId === 'string' || typeof maybeId === 'number'
      ? maybeId
      : Math.random().toString(36).slice(2);

  const usernameRaw = item.username ?? item.user?.name ?? item.title ?? item.name ?? 'user';
  const username = String(usernameRaw ?? 'user');

  const platform = String(item.platform ?? item.model ?? 'ChatGPT');
  const views = Number(item.views ?? item.viewCount ?? item.stats?.views ?? 0) || 0;
  const related = Number(item.related ?? item.relatedCount ?? item.stats?.related ?? 0) || 0;
  const created = item.createdAt ?? item.created_at ?? item.updatedAt;
  const avatar = (username.charAt(0) || 'U').toUpperCase();

  return { id, avatar, username, platform, views, days: daysAgo(created), related };
}

export default async function Home() {
  // Try DB; if it fails (e.g., during build or no DB), fall back to mocks.
  let items: ConversationLike[] = [];
  try {
    const raw = await listRecentConversations(24);
    items = Array.isArray(raw) ? (raw as ConversationLike[]) : [];
  } catch {
    // swallow: we'll fall back to mocks
  }

  const cards: CardData[] = items.length > 0 ? items.map(toCard) : mockCards;

  return (
    <div className="flex flex-col min-h-screen bg-gray-100">
      <header className="bg-gray-200 p-4 flex justify-between items-center">
        <div className="flex items-center">
          <div className="text-red-800 font-bold flex items-center">
            <svg className="w-6 h-6 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5L5 19H19L12 5Z" fill="currentColor" />
            </svg>
            <span>AI Archives</span>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" className="flex items-center space-x-2">
            <HelpCircle className="w-5 h-5" />
            <span className="text-sm">How to Use</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
        <Card className="p-6 mb-8 shadow-sm border border-gray-200">
          <CardContent className="pt-6">
            <h1 className="text-3xl font-semibold mb-6 text-center">
              Share, Discuss, Cite <span className="text-pink-500">ChatGPT</span> Conversations
            </h1>
            <p className="text-center mb-8">
              Your reliable tool for citing Generative A.I. conversations. Easily save discussions with Gemini, ChatGPT,
              Meta and Claude into a URL.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((card) => (
            <Card
              key={String(card.id)}
              className="overflow-hidden shadow-sm hover:shadow transition-shadow duration-200 border border-gray-200"
            >
              <CardContent className="pt-6 px-6">
                <div className="flex items-start space-x-4">
                  <Avatar
                    className={`h-10 w-10 ${
                      card.avatar === 'S' || card.avatar === 'L'
                        ? 'bg-blue-600'
                        : card.avatar === 'P' || card.avatar === 'U'
                        ? 'bg-orange-600'
                        : card.avatar === 'C' || card.avatar === 'J'
                        ? 'bg-purple-600'
                        : 'bg-gray-600'
                    }`}
                  >
                    <AvatarFallback className="text-white text-sm">{card.avatar}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 pt-1">
                    <Link
                      href={`/c/${String(card.id)}`}
                      className="text-sm font-medium text-gray-800 leading-relaxed hover:underline"
                    >
                      {card.username}
                    </Link>
                    <div className="mt-1">
                      <Badge
                        className={
                          card.platform === 'ChatGPT'
                            ? 'bg-blue-800 hover:bg-blue-700'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }
                      >
                        {card.platform}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500">
                <div className="flex space-x-2">
                  <span>{card.views} Views</span>
                  <span>|</span>
                  <span>{card.days} Days ago</span>
                  <span>|</span>
                  <span>{card.related} Related</span>
                </div>
                <Link href={`/c/${String(card.id)}`} className="text-xs font-medium underline hover:no-underline">
                  View
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
