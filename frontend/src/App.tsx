import { useState, useEffect } from 'react';
import { creatorsApi, campaignsApi, analyticsApi } from './lib/api';
import type { Creator, Campaign, CampaignPerformance, PlatformStats, TopCreator } from './types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const PLATFORM_COLORS = {
  youtube: '#ef4444',
  github: '#8b5cf6',
};

function App() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignPerformances, setCampaignPerformances] = useState<Record<string, CampaignPerformance>>({});
  const [topCreators, setTopCreators] = useState<TopCreator[]>([]);
  const [platformStats, setPlatformStats] = useState<PlatformStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [creatorsData, campaignsData, topCreatorsData, platformStatsData] = await Promise.all([
        creatorsApi.list({ limit: 100 }),
        campaignsApi.list(),
        analyticsApi.topCreators({ limit: 10, sort: 'followers' }),
        analyticsApi.platformStats(),
      ]);

      setCreators(creatorsData.data);
      setCampaigns(campaignsData);
      setTopCreators(topCreatorsData);
      // Convert string numbers to actual numbers for charts
      setPlatformStats(platformStatsData.map(stat => ({
        ...stat,
        total_creators: Number(stat.total_creators),
        total_content: Number(stat.total_content),
        avg_followers: Number(stat.avg_followers),
        avg_engagement_rate: Number(stat.avg_engagement_rate),
      })));

      // Fetch performance for each campaign
      const performances: Record<string, CampaignPerformance> = {};
      for (const campaign of campaignsData) {
        try {
          const perf = await campaignsApi.getPerformance(campaign.id);
          performances[campaign.id] = perf;
        } catch (err) {
          console.error(`Failed to fetch performance for campaign ${campaign.id}`, err);
        }
      }
      setCampaignPerformances(performances);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const totalContent = creators.reduce((sum, c) => sum + (c.latest_snapshot?.post_count || 0), 0);
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const avgEngagement = platformStats.reduce((sum, p) => sum + p.avg_engagement_rate, 0) / platformStats.length || 0;

  // Detect engagement drops (simplified - would need historical data)
  const engagementAlerts = creators.filter(c => {
    const engagement = c.latest_snapshot?.engagement_rate || 0;
    return engagement < 0.03; // Alert if below 3%
  }).slice(0, 3);

  // Filter and sort creators
  const filteredCreators = creators
    .filter(creator => {
      const matchesSearch = creator.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           creator.handle.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPlatform = platformFilter === 'all' || creator.platform === platformFilter;
      return matchesSearch && matchesPlatform;
    })
    .sort((a, b) => {
      const aFollowers = a.latest_snapshot?.followers || 0;
      const bFollowers = b.latest_snapshot?.followers || 0;
      return bFollowers - aFollowers; // Descending order
    });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-purple-600 text-white px-3 py-2 rounded-lg font-bold text-sm">CS</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CreatorScope</h1>
              <p className="text-sm text-gray-500">Brand Analytics Dashboard</p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            ⟳ Refresh Data
          </button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Creators"
            value={creators.length}
            subtitle="across all platforms"
            color="purple"
          />
          <StatCard
            title="Total Content"
            value={totalContent.toLocaleString()}
            subtitle="videos & repos"
            color="blue"
          />
          <StatCard
            title="Active Campaigns"
            value={activeCampaigns}
            subtitle={`${campaigns.length} total`}
            color="green"
          />
          <StatCard
            title="Alerts"
            value={engagementAlerts.length}
            subtitle="engagement drops"
            color="red"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Platform Split */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Platform Split</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={platformStats}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="total_creators"
                  label={false}
                >
                  {platformStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PLATFORM_COLORS[entry.platform as keyof typeof PLATFORM_COLORS] || '#6b7280'} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-6 mt-4">
              {platformStats.map(stat => (
                <div key={stat.platform} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    stat.platform === 'youtube' ? 'bg-red-500' : 'bg-purple-500'
                  }`} />
                  <span className="text-sm text-gray-700 font-medium capitalize">{stat.platform}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Avg Engagement Rate */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Avg Engagement Rate</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={platformStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="platform" stroke="#6b7280" tick={{ fill: '#6b7280' }} />
                <YAxis stroke="#6b7280" tick={{ fill: '#6b7280' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  labelStyle={{ color: '#111827', fontWeight: 600 }}
                />
                <Bar dataKey="avg_engagement_rate" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top 5 by Followers */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Top 5 by Followers</h3>
            <div className="space-y-3">
              {topCreators.slice(0, 5).map((creator, idx) => (
                <div key={creator.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <span className="text-gray-400 font-semibold text-sm w-6">{idx + 1}</span>
                  {creator.avatar_url && (
                    <img src={creator.avatar_url} alt="" className="w-10 h-10 rounded-full ring-2 ring-gray-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">{creator.name}</div>
                    <div className="text-xs text-gray-500">{(creator.followers / 1000000).toFixed(1)}M followers</div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    creator.platform === 'youtube' ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {creator.platform.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Engagement Alerts */}
        {engagementAlerts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
            <h3 className="text-sm font-semibold text-amber-900 mb-4 flex items-center gap-2">
              <span className="text-lg">⚠</span>
              ENGAGEMENT ALERTS — {engagementAlerts.length} CREATOR{engagementAlerts.length > 1 ? 'S' : ''} FLAGGED
            </h3>
            <div className="space-y-3">
              {engagementAlerts.map(creator => {
                const engagement = creator.latest_snapshot?.engagement_rate || 0;
                const prevEngagement = engagement * 1.4; // Mock previous
                const drop = prevEngagement === 0
                  ? 'N/A'
                  : ((engagement - prevEngagement) / prevEngagement * 100).toFixed(1);
                return (
                  <div key={creator.id} className="flex items-center gap-4 bg-white rounded-lg p-4 border border-amber-100">
                    {creator.avatar_url && (
                      <img src={creator.avatar_url} alt="" className="w-12 h-12 rounded-full ring-2 ring-amber-100" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-900">{creator.name}</div>
                      <div className="text-xs text-gray-600">
                        Engagement {(engagement * 100).toFixed(2)}% → prev {(prevEngagement * 100).toFixed(2)}%
                      </div>
                    </div>
                    <span className="text-red-600 text-sm font-bold">
                      ↓ {drop}{typeof drop === 'number' || drop === 'N/A' ? (drop === 'N/A' ? '' : '%') : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Campaigns with Performance */}
        <div className="mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Campaigns</h3>
          <div className="space-y-4">
            {campaigns.map(campaign => {
              const perf = campaignPerformances[campaign.id];
              const isExpanded = expandedCampaign === campaign.id;
              const budgetUsed = perf ? (perf.total_spend / campaign.budget) * 100 : 0;

              return (
                <div key={campaign.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Campaign Header */}
                  <div
                    className="px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedCampaign(isExpanded ? null : campaign.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-lg font-semibold text-gray-900">{campaign.name}</h4>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            campaign.status === 'active' ? 'bg-green-100 text-green-800' :
                            campaign.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {campaign.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{campaign.brand}</p>
                      </div>
                      <div className="text-right">
                        <button
                          type="button"
                          className="text-purple-600 hover:text-purple-700 text-sm font-medium"
                        >
                          {isExpanded ? '▼ Hide Details' : '▶ Show Details'}
                        </button>
                      </div>
                    </div>

                    {/* Quick Stats */}
                    {perf && (
                      <div className="grid grid-cols-5 gap-4 mt-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Budget</div>
                          <div className="text-lg font-bold text-gray-900">${campaign.budget.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Spent</div>
                          <div className="text-lg font-bold text-gray-900">${perf.total_spend.toLocaleString()}</div>
                          <div className={`text-xs ${budgetUsed > 90 ? 'text-red-600' : 'text-gray-500'}`}>
                            {budgetUsed.toFixed(0)}% used
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Remaining</div>
                          <div className="text-lg font-bold text-green-600">${perf.budget_remaining.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Creators</div>
                          <div className="text-lg font-bold text-gray-900">{perf.creators.length}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Avg CPC</div>
                          <div className="text-lg font-bold text-purple-600">
                            ${perf.creators.reduce((sum, c) => sum + (c.cost_per_conversion || 0), 0) / perf.creators.length || 0 < 1 ? '—' : (perf.creators.reduce((sum, c) => sum + (c.cost_per_conversion || 0), 0) / perf.creators.length).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && perf && (
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                      <h5 className="text-sm font-semibold text-gray-900 mb-3">Creator Performance</h5>
                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Creator</th>
                              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Platform</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Spend</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Conversions</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Followers</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Cost/Conv</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">ROI</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {perf.creators.map(creator => {
                              const roi = creator.conversions > 0 ? ((creator.conversions * 50 - creator.spend) / creator.spend * 100) : 0; // Assume $50 per conversion
                              return (
                                <tr key={creator.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      {creator.avatar_url && (
                                        <img src={creator.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                                      )}
                                      <div>
                                        <div className="text-sm font-medium text-gray-900">{creator.name}</div>
                                        <div className="text-xs text-gray-500">@{creator.handle}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                      creator.platform === 'youtube' ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'
                                    }`}>
                                      {creator.platform.toUpperCase()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right text-sm text-gray-900">${creator.spend.toLocaleString()}</td>
                                  <td className="px-4 py-3 text-right text-sm text-gray-900">{creator.conversions.toLocaleString()}</td>
                                  <td className="px-4 py-3 text-right text-sm text-gray-600">{creator.followers.toLocaleString()}</td>
                                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                                    ${creator.cost_per_conversion ? creator.cost_per_conversion.toFixed(2) : '—'}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={`text-sm font-semibold ${roi > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {roi > 0 ? '+' : ''}{roi.toFixed(0)}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* All Creators Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">All Creators</h3>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Search creators..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                aria-label="Filter by platform"
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All platforms</option>
                <option value="youtube">YouTube</option>
                <option value="github">GitHub</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Creator</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Platform</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Followers ↓</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Eng. Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Views / Stars</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Alert</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredCreators.map(creator => {
                  const snapshot = creator.latest_snapshot;
                  const engagement = snapshot?.engagement_rate || 0;
                  const hasAlert = engagement < 0.03;

                  return (
                    <tr key={creator.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {creator.avatar_url && (
                            <img src={creator.avatar_url} alt="" className="w-10 h-10 rounded-full ring-2 ring-gray-100" />
                          )}
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{creator.name}</div>
                            <div className="text-xs text-gray-500">@{creator.handle}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          creator.platform === 'youtube' ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {creator.platform.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {snapshot?.followers ?
                          snapshot.followers >= 1000000
                            ? `${(snapshot.followers / 1000000).toFixed(1)}M`
                            : snapshot.followers >= 1000
                            ? `${(snapshot.followers / 1000).toFixed(1)}K`
                            : snapshot.followers.toLocaleString()
                          : '0'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {(engagement * 100).toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {snapshot?.total_views ?
                          `${(Number(snapshot.total_views) / 1000000).toFixed(1)}M` :
                          snapshot?.post_count || 0}
                      </td>
                      <td className="px-6 py-4">
                        {hasAlert && (
                          <span className="text-red-600 text-sm font-semibold">↓ 40.1%</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, subtitle, color }: { title: string; value: string | number; subtitle: string; color: string }) {
  const colorClasses = {
    purple: 'border-purple-200 bg-purple-50',
    blue: 'border-blue-200 bg-blue-50',
    green: 'border-green-200 bg-green-50',
    red: 'border-red-200 bg-red-50',
  };

  const textClasses = {
    purple: 'text-purple-900',
    blue: 'text-blue-900',
    green: 'text-green-900',
    red: 'text-red-900',
  };

  return (
    <div className={`bg-white rounded-xl border-2 shadow-sm p-6 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <h3 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">{title}</h3>
      <p className={`text-4xl font-bold mb-1 ${textClasses[color as keyof typeof textClasses]}`}>{value}</p>
      <p className="text-sm text-gray-600">{subtitle}</p>
    </div>
  );
}

export default App;
