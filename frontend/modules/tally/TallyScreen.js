import React, { useState, useContext } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  ScrollView,
  Linking
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { ThemeContext, DashboardLayout, dbStyles } from "../../ThemeAndLayout";

// Use same backend URL approach as App.js
const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export default function TallyScreen({ navigation, route }) {
  const { user } = route.params || {};
  const { theme } = useContext(ThemeContext);
  
  // Local state
  const [isSavings, setIsSavings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  
  // Result state
  const [exportResult, setExportResult] = useState(null);

  // Theming colors for active state
  const accent = isSavings ? theme.green : theme.businessAccent;

  const handleDownload = async (url) => {
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        await Linking.openURL(url);
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Download Error", "Could not open download link.");
    }
  };

  const pickDocument = async () => {
    setUploadError("");
    setExportResult(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];

      setLoading(true);
      setLoadingText("Uploading statement...");
      setLoadingProgress(0.2);

      let progressInterval = setInterval(() => {
        setLoadingProgress((prev) => {
          if (prev >= 0.9) return 0.9;
          return prev + 0.1;
        });
      }, 500);

      const formData = new FormData();
      if (Platform.OS === "web") {
        const response = await fetch(file.uri);
        const blob = await response.blob();
        formData.append("statement", blob, file.name);
      } else {
        formData.append("statement", {
          uri: file.uri,
          name: file.name,
          type: "application/pdf",
        });
      }

      // Pass account type to processing
      const statementType = isSavings ? "savings" : "business";
      formData.append("type", statementType);

      setLoadingText("Generating Tally Export...");

      const response = await fetch(`${API_URL}/upload-tally`, {
        method: "POST",
        body: formData,
      });

      let data;
      const rawText = await response.text();
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        console.error("Failed to parse response as JSON. Raw response:", rawText);
        throw new Error("Invalid JSON response from server");
      }

      clearInterval(progressInterval);
      setLoadingProgress(1.0);

      if (response.ok) {
        setExportResult(data);
      } else {
        setUploadError(data.error || "Tally Export Failed. Please check the PDF.");
      }
    } catch (error) {
      console.error(error);
      setUploadError("Network Error: Failed to communicate with the backend server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout user={user} activeNav="tally" navigation={navigation}>
      <ScrollView style={[dbStyles.main, { backgroundColor: theme.bg }]} contentContainerStyle={dbStyles.mainContent}>

        <Text style={[dbStyles.mainTitle, { color: theme.font }]}>Tally Export</Text>
        <Text style={dbStyles.mainSub}>Generate Tally XML and Excel sheets directly from your bank statements.</Text>

        <View style={[dbStyles.uploadCard, { backgroundColor: theme.card, borderColor: theme.border }]}>

          {/* Account type label */}
          <Text style={[dbStyles.sectionLabel, { color: theme.muted }]}>Account Type</Text>
          <TouchableOpacity 
            style={[dbStyles.accountTypeBox, { borderColor: isSavings ? theme.border : theme.businessAccent + "88", marginBottom: 10 }]}
            onPress={() => setIsSavings(false)}
          >
            <View style={[dbStyles.radioOuter, { borderColor: theme.businessAccent }]}>
              {(!isSavings) && <View style={[dbStyles.radioInner, { backgroundColor: theme.businessAccent }]} />}
            </View>
            <Text style={{ fontSize: 22, marginHorizontal: 10 }}>🏦</Text>
            <View>
              <Text style={[dbStyles.accountTypeTitle, { color: theme.font }]}>Current Account</Text>
              <Text style={[dbStyles.accountTypeDesc, { color: theme.muted }]}>For business & daily transaction statements</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[dbStyles.accountTypeBox, { borderColor: isSavings ? theme.green + "88" : theme.border }]}
            onPress={() => setIsSavings(true)}
          >
            <View style={[dbStyles.radioOuter, { borderColor: theme.green }]}>
              {isSavings && <View style={[dbStyles.radioInner, { backgroundColor: theme.green }]} />}
            </View>
            <Text style={{ fontSize: 22, marginHorizontal: 10 }}>🐷</Text>
            <View>
              <Text style={[dbStyles.accountTypeTitle, { color: theme.font }]}>Savings Account</Text>
              <Text style={[dbStyles.accountTypeDesc, { color: theme.muted }]}>For personal savings & passbook statements</Text>
            </View>
          </TouchableOpacity>

          {/* Error banner */}
          {uploadError ? (
            <View style={[dbStyles.errorBanner, { backgroundColor: theme.pink + "22", borderColor: theme.pink, marginTop: 16 }]}>
              <Text style={[dbStyles.errorTitle, { color: theme.pink }]}>⚠ Export Failed</Text>
              <Text style={[dbStyles.errorDesc, { color: theme.muted }]}>{uploadError}</Text>
            </View>
          ) : null}

          {/* Export Success Result */}
          {(exportResult && !loading) ? (
            <View style={{ marginTop: 24, padding: 16, backgroundColor: theme.green + "11", borderRadius: 12, borderWidth: 1, borderColor: theme.green }}>
              <Text style={{ fontSize: 18, fontWeight: "bold", color: theme.green, marginBottom: 8 }}>✅ Export Successful</Text>
              <Text style={{ color: theme.muted, marginBottom: 16 }}>Your statement has been processed into Tally formats.</Text>
              
              <View style={{ flexDirection: "row", gap: 12 }}>
                {exportResult.excelUrl ? (
                  <TouchableOpacity 
                    style={[dbStyles.primaryBtn, { flex: 1, backgroundColor: "#1D6F42" }]}
                    onPress={() => handleDownload(`${API_URL}${exportResult.excelUrl}`)}
                  >
                    <Text style={{ fontSize: 18, marginRight: 8 }}>📊</Text>
                    <Text style={{ color: "#FFF", fontWeight: "bold" }}>Download Excel</Text>
                  </TouchableOpacity>
                ) : null}
                
                {exportResult.xmlUrl ? (
                  <TouchableOpacity 
                    style={[dbStyles.primaryBtn, { flex: 1, backgroundColor: "#E34F26" }]}
                    onPress={() => handleDownload(`${API_URL}${exportResult.xmlUrl}`)}
                  >
                    <Text style={{ fontSize: 18, marginRight: 8 }}>📋</Text>
                    <Text style={{ color: "#FFF", fontWeight: "bold" }}>Download XML</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Drop zone / loading */}
          <View style={{ marginTop: 24 }}>
            {loading ? (
              <View style={dbStyles.loadingBox}>
                <ActivityIndicator size="large" color={accent} />
                <Text style={[dbStyles.loadingText, { color: accent }]}>{loadingText}</Text>
                <View style={dbStyles.progressTrack}>
                  <View style={[dbStyles.progressFill, { width: `${loadingProgress * 100}%`, backgroundColor: accent }]} />
                </View>
              </View>
            ) : (
              <TouchableOpacity style={[dbStyles.dropZone, { borderColor: theme.border, backgroundColor: theme.bg }]} onPress={pickDocument}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>📄</Text>
                <Text style={[dbStyles.dropZoneTitle, { color: theme.font }]}>Upload PDF for Tally</Text>
                <Text style={[dbStyles.dropZoneSub, { color: theme.muted }]}>Drag & drop your statement to process</Text>
                <View style={[dbStyles.browseBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={[dbStyles.browseBtnText, { color: theme.font }]}>⊞ Browse Files</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

        </View>

      </ScrollView>
    </DashboardLayout>
  );
}
