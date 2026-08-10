import React, { createContext, useContext, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Dimensions, Modal, ScrollView } from "react-native";

// ─── Theming ─────────────────────────────────────────────────────────────
export const lightTheme = {
  isDark: false,
  bg: "#F7FAFC",
  card: "#FFFFFF",
  border: "#E2E8F0",
  font: "#1A202C",
  muted: "#64748b",
  sidebar: "#FFFFFF",
  savingsAccent: "#1448ab",
  savingsBg: "#f7faff",
  businessAccent: "#068a51",
  businessBg: "#fbfdfc",
  green: "#068a51",
  purple: "#1448ab",
  pink: "#e11d48",
  yellow: "#d97706",
  textGreen: "#FFFFFF",
};

export const darkTheme = {
  isDark: true,
  bg: "#1a1a24",
  card: "#2c2c38",
  border: "#35354a",
  font: "#FFFFFF",
  muted: "#a0a0b8",
  sidebar: "#232332",
  savingsAccent: "#4a7df0",
  savingsBg: "#12182b",
  businessAccent: "#10b981",
  businessBg: "#102419",
  green: "#10b981",
  purple: "#4a7df0",
  pink: "#ED64A6",
  yellow: "#ECC94B",
  textGreen: "#FFFFFF",
};

export const ThemeContext = createContext();

export function useAppTheme() {
  return useContext(ThemeContext);
}

// ─── Global Dashboard Layout ───────────────────────────────────────────────
export function DashboardLayout({ user, activeNav, navigation, children }) {
  const { theme, toggleTheme } = useAppTheme();
  const isSavings = user?.type === "savings";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(Dimensions.get("window").width);

  React.useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => setWindowWidth(window.width));
    return () => sub?.remove();
  }, []);

  const isDesktop = windowWidth >= 768;
  const accent = isSavings ? theme.savingsAccent : theme.businessAccent;
  const currentBg = theme.isDark ? theme.bg : (isSavings ? theme.savingsBg : theme.businessBg);
  const localTheme = { ...theme, bg: currentBg, accent };

  const NAV = [
    { id: "import",       label: "Import Data",  icon: "☁",  route: "Upload" },
    { id: "dashboard",    label: "Dashboard",    icon: "⊞",  route: "Upload" },
    { id: "analysis",     label: "Analysis",     icon: "◷",  route: "Upload" },
    { id: "tally",        label: "Tally Export", icon: "📊", route: "Tally" },
    { id: "comparisons",  label: "Comparisons",  icon: "⇄",  route: "Comparisons" },
    { id: "reports",      label: "Reports",      icon: "☰",  route: "Reports" },
    { id: "settings",     label: "Settings",     icon: "⚙",  route: "Upload" },
  ];

  const SidebarContent = () => (
    <View style={{ flex: 1, flexDirection: "column" }}>
      {/* Logo */}
      <View style={[dbStyles.sidebarLogo, { borderBottomColor: localTheme.border }]}>
        <View style={[dbStyles.logoIcon, { borderColor: accent + "66", backgroundColor: localTheme.bg }]}>
          <Text style={{ fontSize: 32 }}>{isSavings ? "🐷" : "🏦"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[dbStyles.logoTitle, { color: localTheme.font }]} numberOfLines={1}>Banklyt</Text>
          <Text style={[dbStyles.logoSub, { color: localTheme.muted }]} numberOfLines={1}>Banking + Analytics</Text>
        </View>
      </View>

      {/* Nav items */}
      <ScrollView style={dbStyles.navList} showsVerticalScrollIndicator={false}>
        {NAV.map((item) => {
          const active = item.id === activeNav;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => {
                setDrawerOpen(false);
                if (item.route && item.id !== activeNav) {
                  navigation.navigate(item.route, { user });
                }
              }}
              style={[dbStyles.navItem, active && { backgroundColor: accent + "18" }]}
            >
              <Text style={[dbStyles.navIcon, { color: active ? accent : localTheme.muted }]}>{item.icon}</Text>
              <Text style={[dbStyles.navLabel, { color: active ? accent : localTheme.muted, fontWeight: active ? "700" : "500" }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Bottom: theme toggle, user, security, logout */}
      <View style={[dbStyles.sidebarBottom, { borderTopColor: localTheme.border }]}>
        <TouchableOpacity
          onPress={toggleTheme}
          style={[dbStyles.themeToggle, { borderColor: localTheme.border, backgroundColor: localTheme.bg }]}
        >
          <Text style={{ color: localTheme.font, fontSize: 13, fontWeight: "600" }}>
            {localTheme.isDark ? "☀ Light Mode" : "🌙 Dark Mode"}
          </Text>
        </TouchableOpacity>

        <View style={dbStyles.sidebarUserRow}>
          <View style={[dbStyles.sidebarAvatar, { backgroundColor: accent + "22", borderColor: accent + "55" }]}>
            <Text style={{ fontSize: 16 }}>{isSavings ? "🐷" : "🏦"}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[dbStyles.sidebarUserName, { color: localTheme.font }]}>{user?.name || "Guest"}</Text>
            <Text style={[dbStyles.sidebarUserEmail, { color: localTheme.muted }]} numberOfLines={1}>{user?.email || ""}</Text>
          </View>
        </View>

        <View style={[dbStyles.securityBadge, { borderColor: accent + "44", backgroundColor: localTheme.bg }]}>
          <Text style={{ fontSize: 14 }}>🛡</Text>
          <View>
            <Text style={[dbStyles.secureTitle, { color: localTheme.font }]}>Your data is secure</Text>
            <Text style={[dbStyles.secureEncrypt, { color: accent }]}>256-bit encryption</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[dbStyles.logoutRow, { borderColor: localTheme.pink + "44" }]}
          onPress={() => navigation.replace("Landing")}
        >
          <Text style={[dbStyles.logoutText, { color: localTheme.pink }]}>⎋  Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ThemeContext.Provider value={{ theme: localTheme, toggleTheme }}>
      <View style={[dbStyles.root, { backgroundColor: localTheme.bg }]}>

        {/* ── DESKTOP: fixed left sidebar ── */}
        {isDesktop && (
          <View style={[dbStyles.sidebar, { backgroundColor: localTheme.sidebar, borderRightColor: localTheme.border }]}>
            <SidebarContent />
          </View>
        )}

        {/* ── MOBILE: sticky top bar ── */}
        {!isDesktop && (
          <View style={[dbStyles.mobileTopBar, {
            backgroundColor: localTheme.sidebar,
            borderBottomColor: localTheme.border,
          }]}>
            <View style={[dbStyles.logoIcon, { borderColor: accent + "66", backgroundColor: localTheme.bg, width: 34, height: 34 }]}>
              <Text style={{ fontSize: 18 }}>{isSavings ? "🐷" : "🏦"}</Text>
            </View>
            <Text style={[dbStyles.logoTitle, { color: localTheme.font, flex: 1, marginLeft: 10 }]} numberOfLines={1}>
              Banklyt
            </Text>
            <TouchableOpacity
              onPress={() => setDrawerOpen(true)}
              style={[dbStyles.hamburger, { borderColor: localTheme.border }]}
            >
              <Text style={{ color: localTheme.font, fontSize: 20 }}>☰</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── MOBILE: slide-in drawer ── */}
        {!isDesktop && (
          <Modal
            visible={drawerOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setDrawerOpen(false)}
          >
            <View style={{ flex: 1, flexDirection: "row" }}>
              <View style={[dbStyles.drawerPanel, { backgroundColor: localTheme.sidebar }]}>
                <SidebarContent />
              </View>
              {/* Tap outside to close */}
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
                activeOpacity={1}
                onPress={() => setDrawerOpen(false)}
              />
            </View>
          </Modal>
        )}

        {/* ── MAIN CONTENT ── */}
        <View style={[dbStyles.main, {
          backgroundColor: localTheme.bg,
          marginTop: isDesktop ? 0 : 54,
        }]}>
          {children}
        </View>
      </View>
    </ThemeContext.Provider>
  );
}

// --- Dashboard layout styles ---
export const dbStyles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
  },
  // Desktop sidebar
  sidebar: {
    width: 300,
    flexDirection: "column",
    borderRightWidth: 1,
    paddingTop: Platform.OS === "web" ? 0 : 44,
  },
  sidebarLogo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
  },
  logoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  logoTitle: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  logoSub: {
    fontSize: 13,
  },
  navList: {
    flex: 1,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  navIcon: {
    fontSize: 22,
    width: 28,
    textAlign: "center",
  },
  navLabel: {
    fontSize: 16,
  },
  sidebarBottom: {
    padding: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  sidebarUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sidebarAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarUserName: {
    fontSize: 14,
    fontWeight: "700",
  },
  sidebarUserEmail: {
    fontSize: 12,
  },
  securityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
  },
  secureTitle: {
    fontSize: 10,
    fontWeight: "700",
  },
  secureEncrypt: {
    fontSize: 10,
    fontWeight: "600",
  },
  logoutRow: {
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "700",
  },
  main: {
    flex: 1,
    overflow: "hidden",
  },
  mainContent: {
    padding: 24,
    maxWidth: 860,
    alignSelf: "center",
    width: "100%",
  },
  themeToggle: {
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  // Mobile
  mobileTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    zIndex: 100,
    paddingTop: Platform.OS === "ios" ? 10 : 0,
  },
  hamburger: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerPanel: {
    width: 270,
    paddingTop: Platform.OS === "ios" ? 44 : 24,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
});
