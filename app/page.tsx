import { HelpCircle } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Mock data for the cards
const mockCards = [
  {
    id: 1,
    avatar: 'S',
    username: 'test',
    platform: 'ChatGPT',
    views: 25,
    days: 66,
    related: 0,
  },
  {
    id: 2,
    avatar: 'P',
    username: 'test',
    platform: 'ChatGPT',
    views: 43,
    days: 79,
    related: 0,
  },
  {
    id: 3,
    avatar: 'U',
    username: 'test',
    platform: 'Claude',
    views: 70,
    days: 101,
    related: 0,
  },
  {
    id: 4,
    avatar: 'C',
    username: 'test',
    platform: 'ChatGPT',
    views: 36,
    days: 88,
    related: 0,
  },
  {
    id: 5,
    avatar: 'S',
    username: 'test',
    platform: 'ChatGPT',
    views: 24,
    days: 85,
    related: 0,
  },
];

const Home = () => {
  return (
    <div className='flex flex-col min-h-screen bg-gray-100'>
      <header className='bg-gray-200 p-4 flex justify-between items-center'>
        <div className='flex items-center'>
          <div className='text-red-800 font-bold flex items-center'>
            <svg className='w-6 h-6 mr-2' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
              <path d='M12 5L5 19H19L12 5Z' fill='currentColor' />
            </svg>
            <span>AI Archives</span>
          </div>
        </div>
        <div className='flex items-center space-x-4'>
          <Button variant='ghost' size='sm' className='flex items-center space-x-2'>
            <HelpCircle className='w-5 h-5' />
            <span className='text-sm'>How to Use</span>
          </Button>
        </div>
      </header>

      <main className='flex-1 container mx-auto px-4 py-8 max-w-6xl'>
        <Card className='p-6 mb-8 shadow-sm border border-gray-200'>
          <CardContent className='pt-6'>
            <h1 className='text-3xl font-semibold mb-6 text-center'>
              Share, Discuss, Cite <span className='text-pink-500'>ChatGPT</span> Conversations
            </h1>
            <p className='text-center mb-8'>
              Your reliable tool for citing Generative A.I. conversations. Easily save discussions with Gemini, ChatGPT,
              Meta and Claude into a URL.
            </p>
          </CardContent>
        </Card>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {mockCards.map((card) => (
            <Card
              key={card.id}
              className='overflow-hidden shadow-sm hover:shadow transition-shadow duration-200 border border-gray-200'
            >
              <CardContent className='pt-6 px-6'>
                <div className='flex items-start space-x-4'>
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
                    <AvatarFallback className='text-white text-sm'>{card.avatar}</AvatarFallback>
                  </Avatar>
                  <div className='flex-1 pt-1'>
                    <p className='text-sm font-medium text-gray-800 leading-relaxed'>{card.username}</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className='px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500'>
                <div>
                  <Badge
                    className={
                      card.platform === 'ChatGPT' ? 'bg-blue-800 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
                    }
                  >
                    {card.platform}
                  </Badge>
                </div>
                <div className='flex space-x-2'>
                  <span>{card.views} Views</span>
                  <span>|</span>
                  <span>{card.days} Days ago</span>
                  <span>|</span>
                  <span>{card.related} Related</span>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Home;
