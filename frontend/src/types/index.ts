export interface Creator {
  id: string;
  platform: 'youtube' | 'github';
  handle: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  profile_url: string;
  created_at: string;
  updated_at: string;
  latest_snapshot?: {
    followers: number;
    following: number | null;
    post_count: number;
    engagement_rate: number;
    total_views: bigint | null;
    captured_at: string;
  };
}

export interface Campaign {
  id: string;
  name: string;
  brand: string;
  budget: number;
  start_date: string;
  end_date: string | null;
  status: 'draft' | 'active' | 'completed';
  created_at: string;
}

export interface CampaignPerformance {
  campaign: Campaign;
  total_spend: number;
  budget_remaining: number;
  creators: Array<{
    id: string;
    handle: string;
    name: string;
    platform: string;
    avatar_url: string | null;
    spend: number;
    conversions: number;
    followers: number;
    engagement_rate: number;
    content_count: number;
    total_views: number;
    cost_per_follower: number;
    cost_per_conversion: number | null;
  }>;
}

export interface PlatformStats {
  platform: string;
  total_creators: number;
  total_content: number;
  avg_followers: number;
  avg_engagement_rate: number;
  total_views: number | null;
}

export interface TopCreator {
  id: string;
  platform: string;
  handle: string;
  name: string;
  avatar_url: string | null;
  followers: number;
  engagement_rate: number;
  post_count: number;
  rank: number;
}
