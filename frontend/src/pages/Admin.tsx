import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Plus, TrendingUp, FolderOpen, CalendarCheck, Table2, Clock3 } from "lucide-react";
import { AutoFixAllButton } from "@/components/admin/AutoFixAllButton";
import { QuickVATUpdate } from "@/components/admin/QuickVATUpdate";
import { ImageOptimizerButton } from "@/components/admin/ImageOptimizerButton";
import { AdminMenuList } from "@/components/admin/AdminMenuList";
import { AdminMenuForm } from "@/components/admin/AdminMenuForm";
import { AdminAnalytics } from "@/components/admin/AdminAnalytics";
import { AdminCategoryList } from "@/components/admin/AdminCategoryList";
import { AdminKnowledge } from "@/components/admin/AdminKnowledge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {Category, MenuItem} from "@/type/type.ts";
import { AdminBookings } from "@/components/admin/AdminBookings";
import { AuthProvider as TimeMapAuthProvider } from "@/features/time-map/hooks/use-auth";

// Konva and html2canvas are heavy; load them only when their tabs open.
const AdminTables = lazy(() => import("@/components/admin/AdminTables").then(module => ({ default: module.AdminTables })));
const TimeMap = lazy(() => import("@/features/time-map/pages/Index"));
const tabFallback = <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
import { adminBookingApi } from "@/lib/bookingApi";
import { useBookingRealtime } from "@/hooks/use-booking-realtime";

const ADMIN_TABS = ["menu", "categories", "analytics", "knowledge", "bookings", "tables", "time-map"];

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") || (searchParams.has("bookingId") ? "bookings" : "menu");
  const tab = ADMIN_TABS.includes(requestedTab) ? requestedTab : "menu";
  const [pendingCount, setPendingCount] = useState(0);
  const loadPendingCount = useCallback(() => {
    void adminBookingApi.pendingBookingCount().then(result => setPendingCount(result.count)).catch(() => undefined);
  }, []);
  useEffect(() => { if (isAdmin) loadPendingCount(); }, [isAdmin, loadPendingCount]);
  useBookingRealtime(loadPendingCount, isAdmin);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = await api.session();
        if (!active) return;
        if (!session.user) { navigate("/auth"); return; }
        if (!session.isAdmin) {
          toast({ title: "Access Denied", description: "Admin access required.", variant: "destructive" });
          navigate("/"); return;
        }
        setIsAdmin(true);
        const result = await api.categories(true);
        if (active) setCategories(result.data);
      } catch (error) {
        if (active) { toast({ title: "Error", description: error instanceof Error ? error.message : "Unable to load dashboard", variant: "destructive" }); navigate("/auth"); }
      } finally { if (active) setLoading(false); }
    })();
    const refresh = () => { void api.categories(true).then(result => { if (active) setCategories(result.data); }).catch(() => undefined); };
    window.addEventListener("categorychange", refresh);
    return () => { active = false; window.removeEventListener("categorychange", refresh); };
  }, [navigate, toast]);

  const handleLogout = async () => {
    await api.logout();
    toast({
      title: "Logged out",
      description: "You've been successfully logged out.",
    });
    navigate("/");
  };

  const handleEdit = (item: MenuItem) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingItem(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-sans font-semibold text-foreground">
                Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Keep your menu fresh and delicious
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => navigate("/menu")}>
                View Menu
              </Button>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs value={tab} onValueChange={value => setSearchParams(value === "menu" ? {} : { tab: value }, { replace: true })} className="space-y-6">
          <TabsList className="grid h-auto w-full lg:w-[1080px] grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
            <TabsTrigger value="menu">Menu Items</TabsTrigger>
            <TabsTrigger value="categories">
              <FolderOpen className="w-4 h-4 mr-2" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <TrendingUp className="w-4 h-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="knowledge">AI Knowledge</TabsTrigger>
            <TabsTrigger value="bookings" className="relative">
              <CalendarCheck className="w-4 h-4 mr-2" />
              Bookings
              {pendingCount > 0 && (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-5 text-white" aria-label={`${pendingCount} pending`}>
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="tables">
              <Table2 className="w-4 h-4 mr-2" />
              Tables
            </TabsTrigger>
            <TabsTrigger value="time-map">
              <Clock3 className="w-4 h-4 mr-2" />
              Time Map
            </TabsTrigger>
          </TabsList>

          <TabsContent value="menu" className="space-y-6">
            {!showForm ? (
              <>
                <div className="flex justify-between items-center flex-wrap gap-3">
                  <h2 className="text-xl font-sans font-semibold">Menu Items</h2>
                  <div className="flex gap-2 flex-wrap">
                    <QuickVATUpdate categories={categories} />
                    <AutoFixAllButton />
                    <ImageOptimizerButton />
                    <Button onClick={() => setShowForm(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Item
                    </Button>
                  </div>
                </div>
                <AdminMenuList onEdit={handleEdit} categories={categories} />
              </>
            ) : (
              <AdminMenuForm
                editingItem={editingItem}
                onClose={handleFormClose}
              categories={categories}
              />
            )}
          </TabsContent>

          <TabsContent value="categories">
            <AdminCategoryList />
          </TabsContent>

          <TabsContent value="analytics">
            <AdminAnalytics />
          </TabsContent>
          <TabsContent value="knowledge"><AdminKnowledge /></TabsContent>
          <TabsContent value="bookings"><AdminBookings /></TabsContent>
          <TabsContent value="tables"><Suspense fallback={tabFallback}><AdminTables /></Suspense></TabsContent>
          <TabsContent value="time-map">
            <div className="h-[calc(100dvh-14rem)] min-h-[560px] overflow-hidden rounded-xl border">
              <TimeMapAuthProvider isAdmin={isAdmin}>
                <Suspense fallback={tabFallback}><TimeMap embedded /></Suspense>
              </TimeMapAuthProvider>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
