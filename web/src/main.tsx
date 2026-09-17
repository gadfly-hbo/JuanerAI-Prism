import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider, useLocation } from 'react-router-dom';
import './index.css';
import { Layout } from './ui';
import { api, Overview } from './api';
import Dashboard from './pages/Dashboard';
import Topics from './pages/Topics';
import Studio from './pages/Studio';
import Channels from './pages/Channels';
import Review from './pages/Review';
import Calendar from './pages/Calendar';
import Analytics from './pages/Analytics';
import Library from './pages/Library';
import Community from './pages/Community';

function LayoutWithBadges() {
  const [badges, setBadges] = useState<Record<string, number>>({});
  const location = useLocation();

  useEffect(() => {
    const refresh = () => api.get<Overview>('/overview').then(o => {
      setBadges({ '/review': o.pendingApproval.length, '/topics': o.pendingTopics.length });
    }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 30_000);  // 待办数随操作与定时器刷新，不再只在挂载时取一次
    return () => clearInterval(timer);
  }, [location.pathname]);

  return <Layout badges={badges} />;
}

const router = createHashRouter([
  {
    element: <LayoutWithBadges />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/topics', element: <Topics /> },
      { path: '/studio', element: <Studio /> },
      { path: '/studio/:id', element: <Studio /> },
      { path: '/channels', element: <Channels /> },
      { path: '/channels/:id', element: <Channels /> },
      { path: '/review', element: <Review /> },
      { path: '/review/:id', element: <Review /> },
      { path: '/calendar', element: <Calendar /> },
      { path: '/analytics', element: <Analytics /> },
      { path: '/library', element: <Library /> },
      { path: '/community', element: <Community /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
