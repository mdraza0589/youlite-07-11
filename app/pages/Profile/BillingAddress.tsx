// New file: app/pages/Profile/BillingAddress.tsx
// Handles fetching, editing, and submitting shipping address and email.
// Added prune and change check logic from original.
// Email is now included as a top-level customer field, editable and savable.

import { getCustomerById, getSession, updateCustomerById } from '@/lib/services/authService';
import Colors from '@/utils/Colors';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Allowed keys for shipping from original
const shippingAllow = [
  'first_name', 'last_name', 'company', 'address_1', 'address_2',
  'city', 'postcode', 'country', 'state', 'email', 'phone',
];

// Prune function from original (for shipping fields)
const pruneAllowedNonEmpty = (addr: Record<string, any>, allowlist: string[]) => {
  const out: Record<string, any> = {};
  allowlist.forEach((k) => {
    const v = addr[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      out[k] = v;
    }
  });
  return out;
};

const BillingAddress = () => {
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  // Email state
  const [email, setEmail] = useState('');
  // Shipping states
  const [sFirst, setSFirst] = useState('');
  const [sLast, setSLast] = useState('');
  const [sCompany, setSCompany] = useState('');
  const [sAddr1, setSAddr1] = useState('');
  const [sAddr2, setSAddr2] = useState('');
  const [sCity, setSCity] = useState('');
  const [sPostcode, setSPostcode] = useState('');
  const [sCountry, setSCountry] = useState('');
  const [sState, setSState] = useState('');
  const [sPhone, setSPhone] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        if (!session?.user?.id) {
          router.replace('/Login/LoginRegisterPage');
          return;
        }
        const data = await getCustomerById(session.user.id);
        setCustomer(data);
        // Seed email
        setEmail(data.email || '');
        // Seed fields for shipping
        setSFirst(data.shipping?.first_name || '');
        setSLast(data.shipping?.last_name || '');
        setSCompany(data.shipping?.company || '');
        setSAddr1(data.shipping?.address_1 || '');
        setSAddr2(data.shipping?.address_2 || '');
        setSCity(data.shipping?.city || '');
        setSPostcode(data.shipping?.postcode || '');
        setSCountry(data.shipping?.country || '');
        setSState(data.shipping?.state || '');
        setSPhone(data.shipping?.phone || '');
      } catch (err: any) {
        console.error('Load error:', err);
        Alert.alert('Error', 'Failed to load profile information.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSave = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      const currentShipping = customer.shipping || {};
      const currentEmail = customer.email || '';
      const newShippingRaw = {
        first_name: sFirst,
        last_name: sLast,
        company: sCompany,
        address_1: sAddr1,
        address_2: sAddr2,
        city: sCity,
        postcode: sPostcode,
        country: sCountry,
        state: sState,
        phone: sPhone,
      };
      const prunedShipping = pruneAllowedNonEmpty(newShippingRaw, shippingAllow);
      const shippingChanged = Object.keys(prunedShipping).some(
        (k) => String(prunedShipping[k] || '') !== String((currentShipping as any)[k] || '')
      );
      const emailChanged = String(email || '').trim() !== String(currentEmail || '').trim();
      const updates: any = {};
      if (emailChanged && email.trim() !== '') {
        updates.email = email.trim();
      }
      if (shippingChanged && Object.keys(prunedShipping).length > 0) {
        updates.shipping = prunedShipping;
      }
      if (Object.keys(updates).length === 0) {
        Alert.alert('Info', 'No changes to save.');
        setSaving(false);
        return;
      }
      const updated = await updateCustomerById(customer.id, updates);
      setCustomer(updated);
      Alert.alert('Success', 'Profile updated successfully.');
      router.back();
    } catch (err: any) {
      console.error('Update error:', err);
      Alert.alert('Error', err?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={Colors.PRIMARY} style={styles.center} />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={'dark-content'} backgroundColor={Colors.PRIMARY} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Shipping Address</Text>
        </View>
        <ScrollView
          style={styles.form}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.formContent}
        >
          {/* Email Input */}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999" // Fixed placeholder color
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {/* Shipping Inputs */}
          <TextInput
            style={styles.input}
            placeholder="First Name"
            placeholderTextColor="#999" // Fixed placeholder color
            value={sFirst}
            onChangeText={setSFirst}
          />
          <TextInput
            style={styles.input}
            placeholder="Last Name"
            placeholderTextColor="#999" // Fixed placeholder color
            value={sLast}
            onChangeText={setSLast}
          />
          <TextInput
            style={styles.input}
            placeholder="Company (Optional)"
            placeholderTextColor="#999" // Fixed placeholder color
            value={sCompany}
            onChangeText={setSCompany}
          />
          <TextInput
            style={styles.input}
            placeholder="Address Line 1"
            placeholderTextColor="#999" // Fixed placeholder color
            value={sAddr1}
            onChangeText={setSAddr1}
          />
          <TextInput
            style={styles.input}
            placeholder="Address Line 2 (Optional)"
            placeholderTextColor="#999" // Fixed placeholder color
            value={sAddr2}
            onChangeText={setSAddr2}
          />
          <TextInput
            style={styles.input}
            placeholder="City"
            placeholderTextColor="#999" // Fixed placeholder color
            value={sCity}
            onChangeText={setSCity}
          />
          <TextInput
            style={styles.input}
            placeholder="Postcode"
            placeholderTextColor="#999" // Fixed placeholder color
            value={sPostcode}
            onChangeText={setSPostcode}
          />
          <TextInput
            style={styles.input}
            placeholder="Country"
            placeholderTextColor="#999" // Fixed placeholder color
            value={sCountry}
            onChangeText={setSCountry}
          />
          <TextInput
            style={styles.input}
            placeholder="State"
            placeholderTextColor="#999" // Fixed placeholder color
            value={sState}
            onChangeText={setSState}
          />
          <TextInput
            style={styles.input}
            placeholder="Phone"
            placeholderTextColor="#999" // Fixed placeholder color
            value={sPhone}
            onChangeText={setSPhone}
            keyboardType="phone-pad"
          />

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={onSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.WHITE} />
            ) : (
              <Text style={styles.saveText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

// You can write your stylesheet here
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8'
  },
  safeArea: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.PRIMARY,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 20,
    color: Colors.WHITE,
    marginLeft: 16,
    fontWeight: '600',
  },
  form: {
    flex: 1,
  },
  formContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
    color: '#333', // Fixed text color
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: Colors.PRIMARY,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: Colors.WHITE,
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default BillingAddress;