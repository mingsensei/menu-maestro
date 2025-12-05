import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, TrendingUp, Calendar } from "lucide-react";

export const AdminAnalytics = () => {
  const [totalViews, setTotalViews] = useState(0);
  const [todayViews, setTodayViews] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Get total views
      const { count: total } = await supabase
        .from("page_views")
        .select("*", { count: "exact", head: true });

      setTotalViews(total || 0);

      // Get today's views
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: todayCount } = await supabase
        .from("page_views")
        .select("*", { count: "exact", head: true })
        .gte("viewed_at", today.toISOString());

      setTodayViews(todayCount || 0);
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