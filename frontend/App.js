import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, Alert, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

// API Configuration
// Pointing back to your laptop via local IP
const API_URL = 'http://10.208.82.38:3000';
//const API_URL = 'http://192.168.0.4:3000'; // home wifi
const Stack = createNativeStackNavigator();

// --- 1. Upload Screen ---
function UploadScreen({ navigation }) {
  const [loading, setLoading] = useState(false);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        uploadPdf(result.assets[0]);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const uploadPdf = async (file) => {
    setLoading(true);
    let formData = new FormData();

    if (Platform.OS === 'web' && file.file) {
      // On Web, use the native HTML File object
      formData.append('statement', file.file);
    } else {
      // On Mobile
      formData.append('statement', {
        uri: file.uri,
        name: file.name,
        type: 'application/pdf',
      });
    }

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: {
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: formData,
      });

      let data;
      const rawText = await response.text();
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        console.error('Failed to parse response as JSON. Raw response:', rawText);
        throw new Error('Invalid JSON response from server');
      }

      if (response.ok) {
        navigation.navigate('Transactions', { transactions: data });
      } else {
        Alert.alert('Analysis Failed', data.error || 'Something went wrong');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Network/Server Error', 'Failed to communicate with the backend. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bank Statement to Journal</Text>
      <Text style={styles.subtitle}>Upload your bank statement PDF to get started</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.loadingText}>Processing PDF...</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.button} onPress={pickDocument}>
          <Text style={styles.buttonText}>Upload PDF</Text>
        </TouchableOpacity>
      )}
      <StatusBar style="auto" />
    </View>
  );
}

// --- 2. Transactions Screen ---
function TransactionsScreen({ route, navigation }) {
  const { transactions } = route.params;
  const [loading, setLoading] = useState(false);

  const generateEntries = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/generate-entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify(transactions),
      });

      const data = await response.json();
      if (response.ok) {
        navigation.navigate('Journal', { entries: data });
      } else {
        Alert.alert('Error', data.error || 'Failed to generate entries');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Network Error', 'Ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardDate}>{item.date}</Text>
        <Text style={[styles.cardAmount, item.type === 'credit' ? styles.creditText : styles.debitText]}>
          ₹{item.amount} ({item.type === 'credit' ? 'Cr' : 'Dr'})
        </Text>
      </View>
      <Text style={styles.cardDesc}>{item.description}</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{item.category}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Extracted Transactions ({transactions.length})</Text>
      <FlatList
        data={transactions}
        renderItem={renderItem}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={styles.listContent}
      />
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.fullWidthButton]}
          onPress={generateEntries}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>Generate Journal Entries</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- 3. Journal Entries Screen ---
function JournalScreen({ route }) {
  const { entries } = route.params;

  const handleDownloadPDF = async () => {
    try {
      let htmlRows = entries.map((item, index) => {
        const debAcc = item.debitAccount || 'Accounts';
        const credAcc = item.creditAccount || 'Accounts';
        const narration = item.narration || `(Being ${item.description})`;

        return `
        <tr>
          <td>${index + 1}</td>
          <td style="white-space: nowrap;">${item.date}</td>
          <td>
            <div style="margin-bottom: 4px;"><strong>${debAcc} A/c</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Dr.</div>
            <div style="padding-left: 30px; margin-bottom: 4px;">To <strong>${credAcc} A/c</strong></div>
            <div style="font-style: italic; color: #555;">[${narration}]</div>
          </td>
          <td></td>
          <td style="text-align: right;">${item.amount}</td>
          <td style="text-align: right;">
            <div style="margin-top: 24px;">${item.amount}</div>
          </td>
        </tr>
      `}).join('');

      let htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 20px; font-size: 14px; }
              h1 { text-align: center; color: #333; margin-bottom: 30px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              th, td { border: 1px solid #333; padding: 12px; vertical-align: top; }
              th { background-color: #f8f9fa; text-align: center; }
            </style>
          </head>
          <body>
            <h1>Journal Entries</h1>
            <table>
              <tr>
                <th style="width: 5%;">Sl No</th>
                <th style="width: 12%;">Date</th>
                <th style="width: 50%;">Particulars</th>
                <th style="width: 5%;">L.F</th>
                <th style="width: 14%;">Debit Rs.</th>
                <th style="width: 14%;">Credit Rs.</th>
              </tr>
              ${htmlRows}
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert("Sharing not available", "Cannot share on this device.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to generate or share PDF.');
    }
  };

  const handleDownloadCSV = async () => {
    try {
      // Create CSV format
      let csvContent = "Date,Description,Amount,Type,Category,Entry\n";
      entries.forEach(item => {
        const desc = `"${(item.description || '').replace(/"/g, '""')}"`;
        const entryStr = `"${(item.entry || '').replace(/"/g, '""')}"`;
        const cat = `"${(item.category || '').replace(/"/g, '""')}"`;
        csvContent += `${item.date},${desc},${item.amount},${item.type},${cat},${entryStr}\n`;
      });

      const fileName = `Journal_Entries_${new Date().getTime()}.csv`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: 'utf8' });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert("Sharing not available", "Cannot share on this device.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to save or share file.');
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.entryCard}>
      <Text style={styles.cardDate}>{item.date}</Text>
      <View style={styles.entryBox}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
          <Text style={styles.entryText}>{item.debitAccount} A/c  Dr.</Text>
          <Text style={styles.entryText}>{item.amount}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 20 }}>
          <Text style={styles.entryText}>To {item.creditAccount} A/c</Text>
          <Text style={styles.entryText}>{item.amount}</Text>
        </View>
      </View>
      <Text style={styles.descText}>{item.narration || `(Being ${item.description})`}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Journal Entries</Text>
      <FlatList
        data={entries}
        renderItem={renderItem}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={styles.listContent}
      />
      <View style={styles.footer}>
        <TouchableOpacity style={[styles.button, styles.downloadButton, styles.fullWidthButton]} onPress={handleDownloadCSV}>
          <Text style={styles.buttonText}>Download / Share CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.downloadButton, styles.fullWidthButton, { marginTop: 10, backgroundColor: '#E74C3C' }]} onPress={handleDownloadPDF}>
          <Text style={styles.buttonText}>Download / Share PDF</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- Navigation ---
export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Upload"
        screenOptions={{
          headerStyle: { backgroundColor: '#4A90E2' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen name="Upload" component={UploadScreen} options={{ title: 'Import Data' }} />
        <Stack.Screen name="Transactions" component={TransactionsScreen} options={{ title: 'Transactions' }} />
        <Stack.Screen name="Journal" component={JournalScreen} options={{ title: 'General Journal' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  button: {
    backgroundColor: '#4A90E2',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  fullWidthButton: {
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    margin: 15,
    alignSelf: 'flex-start',
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    width: '100%',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardDate: {
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
  },
  cardAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  creditText: {
    color: '#27AE60',
  },
  debitText: {
    color: '#E74C3C',
  },
  cardDesc: {
    fontSize: 15,
    color: '#444',
    marginBottom: 10,
  },
  badge: {
    backgroundColor: '#E8F4FD',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: '#4A90E2',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  footer: {
    padding: 15,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    width: '100%',
  },
  entryCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#4A90E2',
    elevation: 2,
    width: '100%',
  },
  entryBox: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 6,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  entryText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
  },
  descText: {
    fontSize: 13,
    color: '#777',
    fontStyle: 'italic',
  }
});
