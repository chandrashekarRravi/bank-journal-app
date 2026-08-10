import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Platform, TextInput, FlatList, Alert,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { DashboardLayout, useAppTheme } from "../../ThemeAndLayout";

// Match App.js fallback chain — render.com for prod, local for dev
const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://bank-journal-backend.onrender.com" || "http://localhost:3000";


const BANKS = [
  { id: "hdfc",   label: "HDFC Bank" },
  { id: "sbi",    label: "SBI" },
  { id: "icici",  label: "ICICI Bank" },
  { id: "canara", label: "Canara Bank" },
  { id: "axis",   label: "Axis Bank" },
  { id: "other",  label: "Other" },
];

function base64ToBlob(b64, mimeType) {
  const byteChars = atob(b64);
  const byteArr   = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  return new Blob([byteArr], { type: mimeType });
}

function downloadBlob(blob, filename) {
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href  = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function TallyScreen({ route, navigation }) {
  const { user } = route.params || {};
  const { theme } = useAppTheme();
  const isSavings = user?.type === "savings";
  const accent    = isSavings ? theme.savingsAccent : theme.businessAccent;

  const [step, setStep]               = useState(1); // 1=select bank, 2=upload, 3=result
  const [selectedBank, setSelectedBank] = useState(null);
  const [pdfFile, setPdfFile]         = useState(null);
  const [companyName, setCompanyName] = useState(user?.name || "");
  const [bankLedger, setBankLedger]   = useState("Bank Account");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [result, setResult]           = useState(null); // { transactions, excel, xml }

  const pickPDF = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
    if (!res.canceled && res.assets?.[0]) setPdfFile(res.assets[0]);
  };

  const processFile = async () => {
    if (!pdfFile) { setError("Please upload a PDF first."); return; }
    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      if (Platform.OS === "web") {
        const resp    = await fetch(pdfFile.uri);
        const blob    = await resp.blob();
        formData.append("statement", blob, pdfFile.name || "statement.pdf");
      } else {
        formData.append("statement", { uri: pdfFile.uri, name: pdfFile.name || "statement.pdf", type: "application/pdf" });
      }
      formData.append("accountType",  isSavings ? "savings" : "current");
      formData.append("bankType",     selectedBank || "other");
      formData.append("companyName",  companyName || "My Company");
      formData.append("bankLedger",   bankLedger  || "Bank Account");

      const response = await fetch(`${API_URL}/tally/export`, {
        method: "POST",
        headers: { "Bypass-Tunnel-Reminder": "true" },
        body: formData,
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const rawText = await response.text();
        throw new Error(
          `Server returned an unexpected response (HTTP ${response.status}). ` +
          `The /tally/export route may not be deployed yet on the live backend. ` +
          `Run the backend locally and set EXPO_PUBLIC_API_URL=http://<your-ip>:3000.\n\nRaw: ${rawText.substring(0, 200)}`
        );
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Export failed");

      setResult(data);
      setStep(3);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = () => {
    if (!result?.excel) return;
    const blob = base64ToBlob(result.excel, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    downloadBlob(blob, `Banklyt_Tally_${companyName || "Export"}.xlsx`);
  };

  const downloadXML = () => {
    if (!result?.xml) return;
    const blob = base64ToBlob(result.xml, "application/xml");
    downloadBlob(blob, `Banklyt_Tally_${companyName || "Export"}.xml`);
  };

  // ─── Step 1: Bank selector ────────────────────────────────────────────────
  const renderStep1 = () => (
    <View style={s.card(theme)}>
      <Text style={[s.stepTitle, { color: theme.font }]}>Step 1 — Select Your Bank</Text>
      <Text style={[s.stepSub, { color: theme.muted }]}>
        Choose your bank so we apply the right parsing logic.
      </Text>
      <View style={s.bankGrid}>
        {BANKS.map(b => {
          const active = selectedBank === b.id;
          return (
            <TouchableOpacity
              key={b.id}
              onPress={() => setSelectedBank(b.id)}
              style={[s.bankPill, { borderColor: active ? accent : theme.border, backgroundColor: active ? accent + "18" : theme.card }]}
            >
              <Text style={{ color: active ? accent : theme.muted, fontWeight: active ? "700" : "500", fontSize: 14 }}>
                {b.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[s.inputLabel, { color: theme.muted }]}>Company Name (for Tally XML)</Text>
      <TextInput
        style={[s.input(theme), { borderColor: theme.border }]}
        value={companyName}
        onChangeText={setCompanyName}
        placeholder="e.g. Knowledge Movers and Shakers"
        placeholderTextColor={theme.muted}
      />

      <Text style={[s.inputLabel, { color: theme.muted }]}>Bank Ledger Name in Tally</Text>
      <TextInput
        style={[s.input(theme), { borderColor: theme.border }]}
        value={bankLedger}
        onChangeText={setBankLedger}
        placeholder="e.g. HDFC Bank Account"
        placeholderTextColor={theme.muted}
      />

      <TouchableOpacity
        style={[s.btn, { backgroundColor: accent, marginTop: 16, opacity: selectedBank ? 1 : 0.4 }]}
        onPress={() => selectedBank && setStep(2)}
        disabled={!selectedBank}
      >
        <Text style={s.btnText}>Next →</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Step 2: Upload PDF ───────────────────────────────────────────────────
  const renderStep2 = () => (
    <View style={s.card(theme)}>
      <Text style={[s.stepTitle, { color: theme.font }]}>Step 2 — Upload Bank Statement</Text>
      <Text style={[s.stepSub, { color: theme.muted }]}>
        Bank: <Text style={{ fontWeight: "700", color: accent }}>
          {BANKS.find(b => b.id === selectedBank)?.label}
        </Text>
        {"  |  "}Account: <Text style={{ fontWeight: "700", color: accent }}>
          {isSavings ? "Savings" : "Current"}
        </Text>
      </Text>

      <TouchableOpacity
        style={[s.dropZone(theme), { borderColor: pdfFile ? accent : theme.border }]}
        onPress={pickPDF}
      >
        <Text style={{ fontSize: 36, marginBottom: 10 }}>📄</Text>
        {pdfFile ? (
          <>
            <Text style={{ color: accent, fontWeight: "700", fontSize: 15 }}>{pdfFile.name}</Text>
            <Text style={[s.stepSub, { color: theme.muted, marginTop: 4 }]}>Tap to change file</Text>
          </>
        ) : (
          <>
            <Text style={{ color: theme.font, fontWeight: "600", fontSize: 15 }}>Tap to select PDF</Text>
            <Text style={[s.stepSub, { color: theme.muted, marginTop: 4 }]}>Bank Statement (PDF format)</Text>
          </>
        )}
      </TouchableOpacity>

      {error ? <Text style={s.error}>{error}</Text> : null}

      <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
        <TouchableOpacity style={[s.btn, { backgroundColor: theme.border, flex: 1 }]} onPress={() => setStep(1)}>
          <Text style={[s.btnText, { color: theme.font }]}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btn, { backgroundColor: accent, flex: 2, opacity: loading ? 0.6 : 1 }]}
          onPress={processFile}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color="#FFF" />
            : <Text style={s.btnText}>⚙ Process & Export</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );

  // ─── Step 3: Results & downloads ─────────────────────────────────────────
  const renderStep3 = () => (
    <View>
      {/* Summary card */}
      <View style={s.card(theme)}>
        <Text style={[s.stepTitle, { color: theme.font }]}>✅ Export Ready</Text>
        <Text style={[s.stepSub, { color: theme.muted }]}>
          {result?.transactions?.length || 0} transactions parsed from{" "}
          <Text style={{ color: accent, fontWeight: "700" }}>{pdfFile?.name}</Text>
        </Text>

        <View style={{ flexDirection: "row", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: "#068a51", flex: 1, minWidth: 160 }]}
            onPress={downloadExcel}
          >
            <Text style={s.btnText}>⬇ Download Excel (.xlsx)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: accent, flex: 1, minWidth: 160 }]}
            onPress={downloadXML}
          >
            <Text style={s.btnText}>⬇ Download Tally XML (.xml)</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={{ marginTop: 14, alignSelf: "center" }} onPress={() => { setResult(null); setPdfFile(null); setStep(1); }}>
          <Text style={{ color: theme.muted, fontSize: 13 }}>↩ Process another file</Text>
        </TouchableOpacity>
      </View>

      {/* Transaction preview */}
      <View style={[s.card(theme), { padding: 0, overflow: "hidden" }]}>
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <Text style={{ fontWeight: "700", fontSize: 15, color: theme.font }}>
            Transaction Preview ({result?.transactions?.length || 0})
          </Text>
        </View>
        {result?.transactions?.slice(0, 50).map((t, i) => {
          const isCredit = (t.type || "").toLowerCase() === "credit";
          return (
            <View
              key={i}
              style={[s.txnRow, { borderBottomColor: theme.border, backgroundColor: i % 2 === 0 ? theme.card : theme.bg }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: theme.muted }}>{t.date}</Text>
                <Text style={{ fontSize: 13, color: theme.font }} numberOfLines={1}>{t.description}</Text>
                <Text style={{ fontSize: 11, color: theme.muted }}>{t.category}</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: isCredit ? "#068a51" : "#e11d48" }}>
                {isCredit ? "+" : "-"}₹{t.amount}
              </Text>
            </View>
          );
        })}
        {(result?.transactions?.length || 0) > 50 && (
          <Text style={{ textAlign: "center", padding: 12, color: theme.muted, fontSize: 12 }}>
            Showing first 50 of {result.transactions.length} transactions
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <DashboardLayout user={user} activeNav="tally" navigation={navigation}>
      <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: theme.font }}>
            🏦 Tally Export
          </Text>
          <Text style={{ fontSize: 13, color: theme.muted, marginTop: 4 }}>
            Parse your bank PDF and export to Excel + Tally XML
          </Text>
        </View>

        {/* Step indicator */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 8 }}>
          {[1, 2, 3].map(n => (
            <React.Fragment key={n}>
              <View style={[s.stepDot, { backgroundColor: step >= n ? accent : theme.border }]}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{n}</Text>
              </View>
              {n < 3 && <View style={{ flex: 1, height: 2, backgroundColor: step > n ? accent : theme.border }} />}
            </React.Fragment>
          ))}
        </View>

        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </ScrollView>
    </DashboardLayout>
  );
}

const s = {
  card: (theme) => ({
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  }),
  stepTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  stepSub: {
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  bankGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
    marginBottom: 16,
  },
  bankPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.5,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 10,
  },
  input: (theme) => ({
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: theme.font,
    backgroundColor: theme.bg,
    ...Platform.select({ web: { outlineStyle: "none" } }),
  }),
  dropZone: (theme) => ({
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    backgroundColor: theme.bg,
    marginVertical: 10,
  }),
  btn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  btnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
  },
  error: {
    color: "#e11d48",
    fontSize: 13,
    marginTop: 8,
    padding: 10,
    backgroundColor: "#fff0f3",
    borderRadius: 8,
  },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
};
