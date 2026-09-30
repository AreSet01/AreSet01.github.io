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
  /* ── 示例数据（可随时替换或新增） ───────────────────────────────────── */
  {
    id: 'yuejiang-sunset-cycling',
    title: '沿江落日骑行与江风放空',
    category: 'activities',
    categoryLabel: '体验玩乐',
    city: '广州 · 阅江路绿道',
    tags: ['落日骑行', '江边散步', '治愈放空', '晚风'],
    rating: 5,
    badge: '解压首选',
    summary: '沿着有轨电车道与珠江畔骑行，看夕阳把江面染成金橙色。吹着晚风，听着耳机里的音乐，一整天的疲惫都烟消云散。',
    tips: [
      '建议下午 5:30 - 6:30 之间开骑，刚好捕捉蓝调时刻与落日余晖',
      '可从猎德大桥底一直骑到琶醍，中途很多开阔草坪可以小坐',
      '傍晚沿途共享单车比较抢手，看到车况好的可以直接扫码'
    ],
    bestTime: '晴天傍晚（日落前半小时至华灯初上）',
    locationUrl: 'https://ditu.amap.com/search?query=%E9%98%85%E6%B1%9F%E4%B8%AD%E8%B7%AF',
    dateAdded: '2026-09-30',
    isUserAdded: false,
  },
  {
    id: 'handbrew-coffee-kit',
    title: '手冲咖啡仪式感套装',
    category: 'items',
    categoryLabel: '日常好物',
    city: '居家书房',
    tags: ['咖啡器具', '生活仪式感', '晨间清醒', '日常陪伴'],
    rating: 5,
    badge: '每日相伴',
    summary: '清晨或者写代码卡壳时，慢慢研磨咖啡豆、注水闷蒸，闻着满室的花果香气，心会瞬间安静下来。不仅是喝咖啡，更是一段专属的专注时光。',
    tips: [
      '新手推荐入门款三洋梯形滤杯或 V60，容错率高、出品稳定',
      '咖啡豆推荐埃塞俄比亚水洗花魁或耶加雪菲，花果香明亮干净',
      '推荐粉水比 1:15，水温控制在 90℃ - 92℃ 之间口感最佳'
    ],
    bestTime: '晨间开工前 / 午后专注码字时',
    dateAdded: '2026-09-30',
    isUserAdded: false,
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
