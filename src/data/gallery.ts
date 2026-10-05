// src/data/gallery.ts — 【拾影 · 山海留痕】个人相册数据层
export type PhotoCategoryId = 'all' | 'nature' | 'urban' | 'daily' | 'humanities';

export interface PhotoExif {
  camera: string;
  lens: string;
  aperture: string;
  shutter: string;
  iso: string;
  focalLength?: string;
}

export interface PhotoItem {
  id: string;
  title: string;
  story: string; // 背后故事 / 拍摄手记
  location: string; // 拍摄地点
  date: string; // 拍摄日期 (YYYY-MM-DD)
  category: PhotoCategoryId;
  categoryLabel: string;
  aspectRatio: '3:2' | '2:3' | '16:9' | '4:3' | '1:1';
  tags: string[];
  exif: PhotoExif;
  exifDisplay: string;
  url: string; // 图片资源路径
  featured?: boolean;
}

export interface PhotoCategoryInfo {
  id: PhotoCategoryId;
  name: string;
  nameEn: string;
  icon: string;
  desc: string;
}

export const PHOTO_CATEGORIES: PhotoCategoryInfo[] = [
  { id: 'all', name: '全部影痕', nameEn: 'All Photos', icon: '✦', desc: '山川、湖海、街角与静默时刻' },
  { id: 'nature', name: '山海风光', nameEn: 'Nature & Land', icon: '⛰️', desc: '吹过晚风的山海、暮色与浩瀚星空' },
  { id: 'urban', name: '城市漫游', nameEn: 'Urban Life', icon: '🏙️', desc: '老街雨夜、霓虹灯牌与城市天际线' },
  { id: 'daily', name: '日常静物', nameEn: 'Still Life', icon: '☕', desc: '窗台晨光、手冲咖啡与专注时刻' },
  { id: 'humanities', name: '人文掠影', nameEn: 'Humanities', icon: '🎋', desc: '古道苔阶、竹林微风与行旅心境' },
];

export const GALLERY_PHOTOS: PhotoItem[] = [
  {
    id: 'zhaoqing-huaiji-yanyan',
    title: '石壁燕影 · 肇庆怀集燕岩',
    story: '奇峰耸立，巨洞穿山。怀集燕岩乃华南罕见的喀斯特巨型溶洞，千百年来金丝燕在此筑巢栖息。伫立岩前，见峭壁千仞、绿意葱茏，群燕掠空而过，蔚为壮观。',
    location: '广东省肇庆市怀集县 · 燕岩',
    date: '2026-06-07',
    category: 'nature',
    categoryLabel: '山海风光',
    aspectRatio: '3:2',
    tags: ['肇庆怀集', '燕岩', '喀斯特', '山川风光'],
    exif: {
      camera: 'Sony A7C',
      lens: 'Tamron 70-300mm F4.5-6.3 Di III RXD',
      aperture: 'f/11',
      shutter: '1/1000s',
      iso: 'ISO 1600',
      focalLength: '273mm',
    },
    exifDisplay: 'Sony A7C · Tamron 70-300mm · f/11 · 1/1000s · ISO 1600 · 273mm',
    url: '/images/gallery/yanyan-huaiji.webp',
    featured: true,
  },
];

export function getAllPhotos(): PhotoItem[] {
  return GALLERY_PHOTOS;
}

export function getPhotoById(id: string): PhotoItem | undefined {
  return GALLERY_PHOTOS.find((p) => p.id === id);
}

export function getPhotosByCategory(catId: PhotoCategoryId): PhotoItem[] {
  if (catId === 'all') return GALLERY_PHOTOS;
  return GALLERY_PHOTOS.filter((p) => p.category === catId);
}

export function getAllPhotoTags(): string[] {
  const set = new Set<string>();
  GALLERY_PHOTOS.forEach((p) => p.tags.forEach((t) => set.add(t)));
  return Array.from(set);
}

export function getAllPhotoLocations(): string[] {
  const set = new Set<string>();
  GALLERY_PHOTOS.forEach((p) => set.add(p.location));
  return Array.from(set);
}
