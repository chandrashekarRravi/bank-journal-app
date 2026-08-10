import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Dimensions,
  Platform,
  Animated,
  Easing,
  ScrollView,
  StatusBar,
} from "react-native";

// ─── Palette (Light Mode) ────────────────────────────────────────────────────
const C = {
  savingsBg: "#f7faff",
  businessBg: "#fbfdfc",
  savings: "#1448ab",   // blue
  business: "#068a51",  // green
  green: "#068a51",     // alias
  purple: "#1448ab",    // alias
  font: "#1A202C",
  muted: "#64748b",
  textOnAccent: "#FFFFFF",
  textGreen: "#FFFFFF",
  card: "#FFFFFF",
  border: "#E2E8F0",
  inputBg: "#F8FAFC",
  pink: "#e11d48",
  bg: "#f1f5f9",
};

const DUMMY = {
  current: { email: "demo@business.com", password: "Demo@123", name: "Radhakrishna" },
  savings: { email: "demo@personal.com", password: "Demo@123", name: "Radhakrishna" },
};

// ─── AnimatedPressable ────────────────────────────────────────────────────────
function AnimatedPressable({ onPress, style, children, disabled }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: false,
      speed: 50,
      bounciness: 0,
    }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: false,
      speed: 20,
      bounciness: 4,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={onPress}
        activeOpacity={1}
        disabled={disabled}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── AnimatedInput ────────────────────────────────────────────────────────────
function AnimatedInput({ icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, accent, extra }) {
  const borderAnim = useRef(new Animated.Value(0)).current;

  const onFocus = () => {
    Animated.timing(borderAnim, { toValue: 1, duration: 250, useNativeDriver: false, easing: Easing.out(Easing.quad) }).start();
  };
  const onBlur = () => {
    Animated.timing(borderAnim, { toValue: 0, duration: 200, useNativeDriver: false, easing: Easing.in(Easing.quad) }).start();
  };

  const borderColor = borderAnim.interpolate({ inputRange: [0, 1], outputRange: [C.border, accent] });
  const bgColor = borderAnim.interpolate({ inputRange: [0, 1], outputRange: [C.bg, accent + "12"] });

  return (
    <Animated.View style={[styles.inputRow, { borderColor, backgroundColor: bgColor }]}>
      <Text style={styles.inputIcon}>{icon}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {extra}
    </Animated.View>
  );
}

// ─── Desktop Split Panel Login (Diprella-style) ───────────────────────────────
function DesktopLogin({ onCurrentLogin, onSavingsLogin }) {
  // 0 = current account view, 1 = savings account view
  const [activePanel, setActivePanel] = useState(0);

  // Animate only background color — panel stays fixed on the right
  const panelAnim = useRef(new Animated.Value(0)).current;

  const switchTo = (idx) => {
    Animated.timing(panelAnim, {
      toValue: idx,
      duration: 400,
      useNativeDriver: false,
      easing: Easing.out(Easing.quad),
    }).start();
    setActivePanel(idx);
  };

  const panelBg = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [C.purple, C.green] });

  return (
    <View style={dStyles.root}>
      {/* === Form Side (always left) === */}
      <View style={dStyles.formSide}>
        {/* Logo top-left */}
        <View style={dStyles.logo}>
          <View style={dStyles.logoBox}><Text style={{ fontSize: 20 }}>🏦</Text></View>
          <View>
            <Text style={dStyles.logoTitle}>Bank Statement</Text>
            <Text style={dStyles.logoSub}>Analyzer · AI · Secure</Text>
          </View>
        </View>

        {/* Tab toggle */}
        <View style={dStyles.tabBar}>
          {["Current Account", "Savings Account"].map((label, i) => (
            <TouchableOpacity key={i} onPress={() => switchTo(i)} style={dStyles.tabBtn}>
              <Text style={[dStyles.tabText, activePanel === i && { color: C.font, fontWeight: "700" }]}>{label}</Text>
              {activePanel === i && (
                <View style={[dStyles.tabUnderline, { backgroundColor: activePanel === 0 ? C.purple : C.green }]} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Form panels */}
        {activePanel === 0
          ? <FormPanel key="current" type="current" accent={C.purple} onLogin={onCurrentLogin} />
          : <FormPanel key="savings" type="savings" accent={C.green} onLogin={onSavingsLogin} />
        }
      </View>

      {/* === Fixed Accent Panel (always on right, only color animates) === */}
      <Animated.View style={[dStyles.accentPanel, { backgroundColor: panelBg }]}>
        {/* Decorative circles */}
        <View style={[dStyles.circle, { top: -60, right: -60, width: 200, height: 200, opacity: 0.15 }]} />
        <View style={[dStyles.circle, { bottom: -80, left: -80, width: 280, height: 280, opacity: 0.1 }]} />
        <View style={[dStyles.circle, { top: "40%", left: "30%", width: 100, height: 100, opacity: 0.12 }]} />

        <View style={dStyles.accentContent}>
          <Text style={dStyles.accentEmoji}>{activePanel === 0 ? "🏦" : "🐷"}</Text>
          <Text style={dStyles.accentHeading}>
            {activePanel === 0 ? "Hello, Business!" : "Hello, Saver!"}
          </Text>
          <Text style={dStyles.accentDesc}>
            {activePanel === 0
              ? "Switch to personal savings account to track your savings & passbook statements."
              : "Switch to current account to analyze your business transactions."}
          </Text>
          <AnimatedPressable
            onPress={() => switchTo(activePanel === 0 ? 1 : 0)}
            style={dStyles.switchBtn}
          >
            <View style={dStyles.switchBtnInner}>
              <Text style={dStyles.switchBtnText}>
                {activePanel === 0 ? "SAVINGS ACCOUNT →" : "CURRENT ACCOUNT →"}
              </Text>
            </View>
          </AnimatedPressable>
        </View>

        {/* Security badge */}
        <View style={dStyles.secBadge}>
          <Text style={dStyles.secBadgeText}>🛡 Bank-level encryption</Text>
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Form Panel (shared for desktop) ─────────────────────────────────────────
function FormPanel({ type, accent, onLogin }) {
  const isCurrent = type === "current";
  const dummy = DUMMY[type];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fade in when switching panels
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
    ]).start();
  }, [type]);

  const handleLogin = () => {
    setError("");
    if (!email.trim() || !password.trim()) { setError("Please enter email and password."); return; }
    if (email.trim() !== dummy.email || password !== dummy.password) {
      setError(`Demo: ${dummy.email}  /  Demo@123`);
      return;
    }
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin({ type, user: dummy }); }, 600);
  };

  return (
    <Animated.View style={[dStyles.formPanel, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={dStyles.formHeading}>
        {isCurrent ? "Login in to Current Account" : "Login in to Savings Account"}
      </Text>
      <Text style={dStyles.formSub}>
        {isCurrent ? "AI-powered business analytics" : "Personal savings & passbook analysis"}
      </Text>

      <AnimatedInput
        icon="✉"
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        accent={accent}
      />

      <AnimatedInput
        icon="🔒"
        placeholder="Enter your password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!showPass}
        accent={accent}
        extra={
          <TouchableOpacity onPress={() => setShowPass(v => !v)}>
            <Text style={{ fontSize: 14, color: C.muted }}>{showPass ? "🙈" : "👁"}</Text>
          </TouchableOpacity>
        }
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity onPress={() => { setEmail(dummy.email); setPassword(dummy.password); setError(""); }} style={dStyles.demoLink}>
        <Text style={[dStyles.demoLinkText, { color: accent }]}>Use demo credentials →</Text>
      </TouchableOpacity>

      <AnimatedPressable onPress={handleLogin} disabled={loading} style={[dStyles.loginBtn, { backgroundColor: accent }]}>
        <View style={dStyles.loginBtnInner}>
          <Text style={[dStyles.loginBtnText, { color: C.textGreen }]}>
            {loading ? "Logining in…" : "LOGIN IN"}
          </Text>
        </View>
      </AnimatedPressable>

      <View style={dStyles.securityRow}>
        {["Bank-Level Security", "End-to-End Encrypted", "ISO Compliant"].map((s, i) => (
          <Text key={i} style={dStyles.securityText}>🛡 {s}</Text>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Mobile Login Screen (App-style, image 3 inspiration) ────────────────────
function MobileLogin({ onCurrentLogin, onSavingsLogin }) {
  // Tabs: 0=current, 1=savings
  const [activeTab, setActiveTab] = useState(0);
  const tabAnim = useRef(new Animated.Value(0)).current;

  const switchTab = (idx) => {
    Animated.timing(tabAnim, { toValue: idx, duration: 300, useNativeDriver: false, easing: Easing.out(Easing.quad) }).start();
    setActiveTab(idx);
  };

  const accent = activeTab === 0 ? C.purple : C.green;
  const accentBg = activeTab === 0 ? C.savingsBg : C.businessBg;

  return (
    <View style={mStyles.root}>
      <StatusBar barStyle="dark-content" />

      {/* Header gradient card */}
      <Animated.View style={[mStyles.headerCard, { backgroundColor: accent }]}>
        {/* Decorative circles */}
        <View style={[mStyles.decCircle, { top: -40, right: -40, width: 160, height: 160, opacity: 0.2 }]} />
        <View style={[mStyles.decCircle, { top: 20, right: 30, width: 80, height: 80, opacity: 0.12 }]} />

        <View style={mStyles.headerContent}>
          <View style={dStyles.logo}>
            <View style={dStyles.logoBox}><Text style={{ fontSize: 20 }}>🏦</Text></View>
            <Text style={dStyles.logoTitle}>Banklyt</Text>
          </View>
          <Text style={mStyles.headerHello}>
            {activeTab === 0 ? "Hello\nLogin in!" : "Hello\nSaver!"}
          </Text>
          <Text style={mStyles.headerSub}>
            {activeTab === 0 ? "Business & Current Account" : "Personal Savings Account"}
          </Text>
        </View>
      </Animated.View>

      {/* Form card */}
      <View style={mStyles.formCard}>
        {/* Tab switcher */}
        <View style={mStyles.tabBar}>
          {["Current", "Savings"].map((label, i) => {
            const isActive = activeTab === i;
            const tabAccent = i === 0 ? C.purple : C.green;
            return (
              <TouchableOpacity key={i} onPress={() => switchTab(i)} style={[mStyles.tabBtn, isActive && { borderBottomColor: tabAccent, borderBottomWidth: 2 }]}>
                <Text style={[mStyles.tabText, isActive && { color: tabAccent, fontWeight: "700" }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <MobileFormPanel
          type={activeTab === 0 ? "current" : "savings"}
          accent={accent}
          onLogin={activeTab === 0 ? onCurrentLogin : onSavingsLogin}
        />
      </View>

      {/* Bottom strip */}
      <View style={mStyles.footer}>
        <Text style={mStyles.footerText}>🛡 Bank-level security  •  Your data is private and encrypted</Text>
      </View>
    </View>
  );
}

function MobileFormPanel({ type, accent, onLogin }) {
  const isCurrent = type === "current";
  const dummy = DUMMY[type];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    fadeAnim.setValue(0); slideAnim.setValue(16);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: false }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: false }),
    ]).start();
  }, [type]);

  const handleLogin = () => {
    setError("");
    if (!email.trim() || !password.trim()) { setError("Please enter email and password."); return; }
    if (email.trim() !== dummy.email || password !== dummy.password) {
      setError(`Demo: ${dummy.email} / Demo@123`);
      return;
    }
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin({ type, user: dummy }); }, 600);
  };

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <AnimatedInput icon="✉" placeholder="Email or Mobile" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" accent={accent} />
      <AnimatedInput
        icon="🔒" placeholder="Password" value={password} onChangeText={setPassword}
        secureTextEntry={!showPass} accent={accent}
        extra={
          <TouchableOpacity onPress={() => setShowPass(v => !v)}>
            <Text style={{ fontSize: 14, color: C.muted }}>{showPass ? "🙈" : "👁"}</Text>
          </TouchableOpacity>
        }
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity onPress={() => { setEmail(dummy.email); setPassword(dummy.password); setError(""); }} style={mStyles.forgotRow}>
        <Text style={[mStyles.forgotText, { color: accent }]}>Use demo credentials →</Text>
      </TouchableOpacity>

      <AnimatedPressable onPress={handleLogin} disabled={loading} style={[mStyles.signInBtn, { backgroundColor: accent }]}>
        <View style={mStyles.signInBtnInner}>
          <Text style={[mStyles.signInBtnText, { color: C.textGreen }]}>
            {loading ? "Logining in…" : "LOGIN IN"}
          </Text>
        </View>
      </AnimatedPressable>

      <View style={mStyles.securityRow}>
        <Text style={mStyles.secText}>🛡 Bank-Level Security</Text>
        <Text style={mStyles.secText}>🔐 End-to-End Encrypted</Text>
      </View>
    </Animated.View>
  );
}

// ─── Root LandingScreen ───────────────────────────────────────────────────────
export default function LandingScreen({ onCurrentLogin, onSavingsLogin }) {
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => setDimensions(window));
    return () => sub?.remove();
  }, []);

  const isWide = dimensions.width >= 768;

  if (isWide) {
    return <DesktopLogin onCurrentLogin={onCurrentLogin} onSavingsLogin={onSavingsLogin} />;
  }
  return <MobileLogin onCurrentLogin={onCurrentLogin} onSavingsLogin={onSavingsLogin} />;
}

// ─── Shared styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 10, borderWidth: 1.5,
    paddingHorizontal: 14, paddingVertical: Platform.OS === "web" ? 11 : 14,
    marginBottom: 12, gap: 8,
    backgroundColor: C.inputBg,
  },
  inputIcon: { fontSize: 14, color: C.muted },
  input: { flex: 1, color: C.font, fontSize: 14, outlineStyle: "none", backgroundColor: "transparent" },
  errorText: { color: C.pink, fontSize: 12, marginBottom: 8, paddingLeft: 2 },
});

// ─── Desktop styles ─────────────────────────────────────────────────────────────
const dStyles = StyleSheet.create({
  root: {
    flex: 1, flexDirection: "row", backgroundColor: C.businessBg,
    height: "100%", overflow: "hidden",
  },
  formSide: {
    width: "50%", paddingHorizontal: 48, paddingVertical: 36,
    justifyContent: "center",
    backgroundColor: C.card,
  },
  logo: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 40 },
  logoBox: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: C.purple + "22",
    borderWidth: 1, borderColor: C.purple + "44", alignItems: "center", justifyContent: "center",
  },
  logoTitle: { color: C.font, fontSize: 13, fontWeight: "700" },
  logoSub: { color: C.muted, fontSize: 10 },

  tabBar: { flexDirection: "row", marginBottom: 28, gap: 24 },
  tabBtn: { paddingBottom: 8 },
  tabText: { color: C.muted, fontSize: 15, fontWeight: "500" },
  tabUnderline: { height: 2, borderRadius: 1, marginTop: 4 },

  formPanel: { maxWidth: 380 },
  formHeading: { color: C.font, fontSize: 26, fontWeight: "800", marginBottom: 6, letterSpacing: -0.5 },
  formSub: { color: C.muted, fontSize: 13, marginBottom: 24 },

  demoLink: { alignSelf: "flex-end", marginBottom: 16, marginTop: 4 },
  demoLinkText: { fontSize: 12, fontWeight: "600" },

  loginBtn: {
    borderRadius: 10, overflow: "hidden", marginBottom: 20,
    ...Platform.select({ web: { cursor: "pointer" }, default: {} }),
  },
  loginBtnInner: { paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  loginBtnText: { fontSize: 15, fontWeight: "800", letterSpacing: 1.5 },

  securityRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  securityText: { color: C.muted, fontSize: 10, fontWeight: "600" },

  // Accent panel — fixed right side, no absolute positioning
  accentPanel: {
    flex: 1,
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  circle: { position: "absolute", borderRadius: 9999, backgroundColor: "#fff" },
  accentContent: { alignItems: "center", paddingHorizontal: 36 },
  accentEmoji: { fontSize: 56, marginBottom: 16 },
  accentHeading: { color: "#fff", fontSize: 32, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  accentDesc: { color: "rgba(255,255,255,0.82)", fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 32 },
  switchBtn: {
    borderRadius: 30, borderWidth: 2, borderColor: "#fff", overflow: "hidden",
    ...Platform.select({ web: { cursor: "pointer" }, default: {} }),
  },
  switchBtnInner: { paddingVertical: 12, paddingHorizontal: 28 },
  switchBtnText: { color: "#fff", fontSize: 13, fontWeight: "700", letterSpacing: 1.2 },
  secBadge: { position: "absolute", bottom: 20 },
  secBadgeText: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
});

// ─── Mobile styles ────────────────────────────────────────────────────────────
const mStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  headerCard: {
    paddingTop: Platform.OS === "web" ? 36 : 54,
    paddingBottom: 40,
    paddingHorizontal: 24,
    overflow: "hidden",
    minHeight: 220,
  },
  decCircle: { position: "absolute", borderRadius: 9999, backgroundColor: "#fff" },
  headerContent: { zIndex: 1 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  logoBox: {
    width: 34, height: 34, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  mLogoTitle: { color: "#fff", fontSize: 13, fontWeight: "700" },
  headerHello: { color: "#fff", fontSize: 32, fontWeight: "800", lineHeight: 38, marginBottom: 6 },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 13 },

  formCard: {
    flex: 1, backgroundColor: C.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    marginTop: -20,
    paddingHorizontal: 24, paddingTop: 24,
    ...Platform.select({
      web: { boxShadow: "0 -8px 30px rgba(0,0,0,0.08)" },
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
    }),
  },

  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 20 },
  tabBtn: { flex: 1, alignItems: "center", paddingBottom: 12 },
  tabText: { color: C.muted, fontSize: 14, fontWeight: "600" },

  forgotRow: { alignSelf: "flex-end", marginBottom: 20, marginTop: 4 },
  forgotText: { fontSize: 12, fontWeight: "600" },

  signInBtn: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 20,
    width: "100%",
    ...Platform.select({ web: { cursor: "pointer" }, default: {} }),
  },
  signInBtnInner: { paddingVertical: 16, alignItems: "center", justifyContent: "center", width: "100%" },
  signInBtnText: { fontSize: 15, fontWeight: "800", letterSpacing: 1.5, color: "#FFFFFF" },

  securityRow: { flexDirection: "row", justifyContent: "space-between" },
  secText: { color: C.muted, fontSize: 11, fontWeight: "600" },

  footer: {
    paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.border, alignItems: "center",
    backgroundColor: C.bg,
  },
  footerText: { color: C.muted, fontSize: 11 },
});
