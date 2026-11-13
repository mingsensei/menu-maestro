import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Plus, TrendingUp, FolderOpen } from "lucide-react";
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

const Admin = () => {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);

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
        <Tabs defaultValue="menu" className="space-y-6">
          <TabsList className="grid h-auto w-full md:w-[720px] grid-cols-2 sm:grid-cols-4">
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
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
