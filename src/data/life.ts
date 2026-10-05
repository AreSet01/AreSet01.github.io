export type LifeCategoryId = 'places' | 'activities' | 'items';

export interface LifeItem {
  id: string;
  title: string;
  category: LifeCategoryId;
  categoryLabel: string;
  city: string;
  tags: string[];
  rating: number; // 1-5 星
  badge?: string; // 亮点标签，如「私藏绝景」、「解压首选」
  summary: string; // 核心推荐理由 / 心得亮点
  tips?: string[]; // 避坑与打卡建议
  bestTime?: string; // 最佳时间/季节
  locationUrl?: string; // 地图或导航链接
  coverImage?: string; // 可选配图 URL
  dateAdded?: string; // 记录时间
  isUserAdded?: boolean; // 区分真实添加与示例占位
}

export interface LifeCategoryInfo {
  id: LifeCategoryId | 'all';
  name: string;
  icon: string;
  desc: string;
}

export const LIFE_CATEGORIES: LifeCategoryInfo[] = [
  { id: 'all', name: '全部拾光', icon: '✦', desc: '生活中的去处、体验与心选好物' },
  { id: 'places', name: '推荐去处', icon: '📍', desc: '值得专程走一遭的风光与角落' },
  { id: 'activities', name: '体验玩乐', icon: '🎈', desc: '给生活充充电的日常趣事' },
  { id: 'items', name: '日常好物', icon: '☕', desc: '提升幸福感的随身陪伴' },
];

export const LIFE_ITEMS: LifeItem[] = [
  {
    id: 'shenzhen-astronomical-observatory',
    title: '深圳天文台',
    category: 'places',
    categoryLabel: '推荐去处',
    city: '深圳 · 大鹏半岛',
    tags: ['日出日落', '看星空', '绝美栈道', '山海风光'],
    rating: 5,
    badge: '私藏绝景',
    summary: '日出日落景美，面朝大海依山傍海，晴夜还可以仰望浩瀚星空与银河。走在依山而建的海边木栈道上，吹吹海风，非常治愈。',
    tips: [
      '前往栈道与参观天文台需提前在「深圳天文」官方公众号预约',
      '看日落建议下午 4 点左右到达西涌海滩，预留徒步上栈道的时间',
      '观星需选择无月光且晴朗通透的夜晚，注意夜间海边防风保暖'
    ],
    bestTime: '晴朗无云的傍晚至深夜 / 春秋季风清气爽最佳',
    locationUrl: 'https://ditu.amap.com/search?query=%E6%B7%B1%E5%9C%B3%E5%A4%A9%E6%96%87%E5%8F%B0',
    dateAdded: '2026-09-30',
    isUserAdded: true,
  },
];

/** 获取所有推荐项目 */
export function getAllLifeItems(): LifeItem[] {
  return LIFE_ITEMS;
}

/** 提取所有标签及去重 */
export function getAllLifeTags(): string[] {
  const set = new Set<string>();
  LIFE_ITEMS.forEach(item => item.tags.forEach(t => set.add(t)));
  return Array.from(set);
}

/** 提取所有城市/区域 */
export function getAllLifeCities(): string[] {
  const set = new Set<string>();
  LIFE_ITEMS.forEach(item => {
    if (item.city) set.add(item.city);
  });
  return Array.from(set);
}
