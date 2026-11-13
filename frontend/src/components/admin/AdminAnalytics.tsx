import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, TrendingUp, Calendar } from "lucide-react";

export const AdminAnalytics = () => {
  const [totalViews, setTotalViews] = useState(0);
  const [todayViews, setTodayViews] = useState(0);
  const [topItems, setTopItems] = useState<{ menu_item_id: string; name: string; view_count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const data = await api.analytics();
      setTotalViews(data.totalViews);
      setTodayViews(data.todayViews);
      setTopItems(data.topItems);
    } catch (error) {
      console.error("Analytics error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-sans font-semibold">Website Analytics</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-primary">{totalViews}</div>
            <p className="text-xs text-muted-foreground mt-1">
              All-time page views
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Views</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-primary">{todayViews}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Views since midnight
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Engagement</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-primary">
              {totalViews > 0 ? ((todayViews / totalViews) * 100).toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Today's share of total
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Most viewed dishes</CardTitle></CardHeader>
        <CardContent>
          {topItems.length ? <ol className="space-y-3">{topItems.map(item => <li key={item.menu_item_id} className="flex justify-between gap-4"><span>{item.name}</span><span className="text-muted-foreground">{Number(item.view_count).toLocaleString()} views</span></li>)}</ol> : <p className="text-sm text-muted-foreground">No dish views yet. Apply the dish-view migration to enable tracking.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="font-sans">Analytics Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Track your restaurant menu's performance with real-time analytics. 
            Page views are automatically logged when visitors access your menu.
          </p>
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">Quick Stats:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Total page views tracked: {totalViews}</li>
              <li>• Views today: {todayViews}</li>
              <li>• Average daily views: {totalViews > 0 ? Math.round(totalViews / Math.max(1, Math.ceil((Date.now() - new Date().setHours(0,0,0,0)) / 86400000))) : 0}</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};