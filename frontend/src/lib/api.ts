import axios from 'axios';
import type { Creator, Campaign, CampaignPerformance, PlatformStats, TopCreator } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const API_VERSION = import.meta.env.VITE_API_VERSION || 'v1';

const api = axios.create({
  baseURL: `${API_URL}/api/${API_VERSION}`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const creatorsApi = {
  list: async (params?: { platform?: string; page?: number; limit?: number }) => {
    const { data } = await api.get<{ success: boolean; data: Creator[]; pagination: any }>('/creators', { params });
    return data;
  },

  getById: async (id: string) => {
    const { data } = await api.get<{ success: boolean; data: Creator }>(`/creators/${id}`);
    return data.data;
  },
};

export const campaignsApi = {
  list: async (params?: { status?: string }) => {
    const { data } = await api.get<{ success: boolean; data: Campaign[] }>('/campaigns', { params });
    return data.data;
  },

  getPerformance: async (id: string) => {
    const { data} = await api.get<{ success: boolean; data: CampaignPerformance }>(`/campaigns/${id}/performance`);
    return data.data;
  },
};

export const analyticsApi = {
  topCreators: async (params?: { sort?: 'followers' | 'engagement'; limit?: number; platform?: string }) => {
    const { data } = await api.get<{ success: boolean; data: TopCreator[] }>('/analytics/top-creators', { params });
    return data.data;
  },

  platformStats: async () => {
    const { data } = await api.get<{ success: boolean; data: PlatformStats[] }>('/analytics/platform-stats');
    return data.data;
  },
};
