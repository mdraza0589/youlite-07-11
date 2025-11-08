// New file: app/pages/Profile/AccountInfo.tsx
// Handles fetching, editing, and submitting account information.
// Fixed email validation to allow real emails from registration

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
import { getCustomerById, getSession, updateCustomerById } from '@/lib/services/authService';
import { SafeAreaView } from 'react-native-safe-area-context';

const AccountInfo = () => {
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  // Edit states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [emailVal, setEmailVal] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');

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

        // Debug logs to verify email data
        console.log('AccountInfo - Customer email:', data.email);
        console.log('AccountInfo - Session email:', session.user.email);

        // Remove the @example.com filtering - show the actual email
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setEmailVal(data.email || ''); // Always set the actual email value
        setUsername(data.username || '');
        setPhone(data.billing?.phone || data.shipping?.phone || '');
      } catch (err: any) {
        console.error('Load error:', err);
        Alert.alert('Error', 'Failed to load account info.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSave = async () => {
    // Basic email validation instead of @example.com restriction
    if (!emailVal) {
      Alert.alert('Validation', 'Please enter your email address.');
      return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailVal)) {
      Alert.alert('Validation', 'Please enter a valid email address.');
      return;
    }

    setSaving(true);
    try {
      const updates: any = {};
      if (firstName !== (customer.first_name || '')) updates.first_name = firstName;
      if (lastName !== (customer.last_name || '')) updates.last_name = lastName;
      if (emailVal !== (customer.email || '')) updates.email = emailVal;
      if (username !== (customer.username || '')) updates.username = username;

      const currentPhone = customer.billing?.phone || customer.shipping?.phone || '';
      if (phone !== currentPhone) {
        // Update billing phone for simplicity, or choose based on which one exists
        updates.billing = { ...(customer.billing || {}), phone };
      }

      if (Object.keys(updates).length === 0) {
        Alert.alert('Info', 'No changes to save.');
        setSaving(false);
        return;
      }

      const updated = await updateCustomerById(customer.id, updates);
      setCustomer(updated);
      Alert.alert('Success', 'Account info updated successfully.');
      router.back();
    } catch (err: any) {
      console.error('Update error:', err);
      Alert.alert('Error', err?.message || 'Failed to update account info.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.PRIMARY} />
        <Text style={{ marginTop: 16, color: '#666' }}>Loading account information...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={'dark-content'} backgroundColor={Colors.PRIMARY} />
      <SafeAreaView style={styles.safeArea}>
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Account Info</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter first name"
              placeholderTextColor="#999"
              value={firstName}
              onChangeText={setFirstName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter last name"
              placeholderTextColor="#999"
              value={lastName}
              onChangeText={setLastName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter email address"
              placeholderTextColor="#999"
              value={emailVal}
              onChangeText={setEmailVal}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter username"
              placeholderTextColor="#999"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoComplete="username"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter phone number"
              placeholderTextColor="#999"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
          </View>

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

          <View style={styles.noteContainer}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.PRIMARY} />
            <Text style={styles.noteText}>
              Your email address will be used for account notifications and password resets.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

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
    alignItems: 'center',
    backgroundColor: '#f8f8f8'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.PRIMARY,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.WHITE,
  },
  headerPlaceholder: {
    width: 32,
  },
  form: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fff',
    color: '#333',
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: Colors.PRIMARY,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: Colors.WHITE,
    fontWeight: 'bold',
    fontSize: 16,
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#e8f4fd',
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
  },
  noteText: {
    color: '#2c6fb7',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
    lineHeight: 20,
  },
});

export default AccountInfo;


