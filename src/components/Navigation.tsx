import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { User, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LanguageSelector } from "@/components/LanguageSelector";

export const Navigation = () => {
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logged out",
      description: "You've been successfully logged out.",
    });
    navigate("/");
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm animate-slide-down">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-foreground hover:text-primary transition-colors"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-md">
              <img
                src="https://res.cloudinary.com/dbp8ozwty/image/upload/v1764756385/z7288581516415_acc08636c048abc731036e54bc165913_gwix72.jpg"
                alt="Restaurant"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-sans text-xl font-semibold hidden sm:inline">
              <span className="text-green-700">Riverside Terrace</span>{' '}
              <span className="text-red-700">Restaurant</span>
            </span>
          </button>

          {/* Auth Section */}
          <div className="flex items-center gap-3">
            <LanguageSelector />
            {user ? (
              <>
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>{user.email}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/admin")}
                  className="hidden sm:inline-flex"
                >
                  Dashboard
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </>
            ) : (
              <Button
                onClick={() => navigate("/auth")}
                className="gap-2 shadow-md hover:shadow-lg transition-all"
              >
                <User className="w-4 h-4" />
                Login
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
