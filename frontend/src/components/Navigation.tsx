import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { api, type Session } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { User, LogOut, LayoutDashboard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LanguageSelector } from "@/components/LanguageSelector";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { useBookingCopy } from "@/content/bookingCopy";

export const Navigation = () => {
  const [user, setUser] = useState<Session["user"]>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useLanguage();
  const { t } = useBookingCopy();
  const linkClass = ({ isActive }: { isActive: boolean }) => `px-2 py-3 ${isActive ? "font-semibold text-primary" : "hover:text-primary"}`;

  useEffect(() => {
    const refresh = () => { api.session().then(session => setUser(session.user)).catch(() => setUser(null)); };
    refresh();
    window.addEventListener("authchange", refresh);
    return () => window.removeEventListener("authchange", refresh);
  }, []);

  const handleLogout = async () => {
    await api.logout();
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
            onClick={() => navigate("/home")}
            className="flex shrink-0 items-center gap-2 text-foreground hover:text-primary transition-colors"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-md">
              <img
                src="/images/restaurant/logo.webp"
                alt="Restaurant"
                className="w-full h-full object-cover"
              />
            </div>
            {/*<span className="font-sans text-xl font-semibold hidden sm:inline">*/}
            {/*  <span className="text-green-700">Riverside Terrace</span>{' '}*/}
            {/*  <span className="text-red-700">Restaurant</span>*/}
            {/*</span>*/}
          </button>

            <div className="flex gap-0 sm:gap-4 text-xs sm:text-sm ml-auto mr-1 sm:mr-6">
              <Link to="/home" className="px-2 py-3 hover:text-primary">{language === "vi" ? "Trang chủ" : "Home"}</Link>
              <NavLink to="/menu" className={linkClass}>{language === "vi" ? "Thực đơn" : "Menu"}</NavLink>
              <NavLink to="/booking" className={linkClass}>{t("navBooking")}</NavLink>
            </div>
            {/* Auth Section */}
          <div className="flex items-center gap-2">
            {/*<DarkModeToggle />*/}
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
                  className="gap-2 px-2 sm:px-3"
                  aria-label="Dashboard"
                >
                  <LayoutDashboard className="h-4 w-4" /><span className="hidden sm:inline">Dashboard</span>
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
                className="gap-2 px-2 sm:px-4 shadow-md hover:shadow-lg transition-all"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">Login</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
