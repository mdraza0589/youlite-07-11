import { getSession, updateCustomerById } from '@/lib/services/authService';
import Colors from '@/utils/Colors';
import Dimenstion from '@/utils/Dimenstion';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function ChangePassword() {
  const router = useRouter();

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 👁️ Show/hide state for each password input
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const validate = () => {
    if (!currentPwd || !newPwd || !confirmPwd) {
      Alert.alert('Error', 'All fields are required.');
      return false;
    }
    if (newPwd.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters.');
      return false;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert('Error', 'New password and confirmation do not match.');
      return false;
    }
    if (newPwd === currentPwd) {
      Alert.alert('Error', 'New password must be different from current password.');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    try {
      const session = await getSession();
      if (!session?.user?.id) {
        Alert.alert('Error', 'User session not found. Please log in again.');
        router.push('/Login/LoginRegisterPage');
        return;
      }

      const response = await updateCustomerById(session.user.id, { password: newPwd });

      if (response && response.id) {
        Alert.alert('Success', 'Password changed successfully.');
        router.back();
      } else {
        throw new Error('Password update failed on server.');
      }
    } catch (err: any) {
      console.error('Password change error:', err);
      Alert.alert('Error', err.message || 'Failed to change password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // 🔤 Reusable input with show/hide toggle
  const renderInput = (
    label: string,
    value: string,
    onChange: (t: string) => void,
    placeholder: string,
    show: boolean,
    setShow: (b: boolean) => void
  ) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder={placeholder}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!show}
          editable={!submitting}
          placeholderTextColor='gray'
        />
        <TouchableOpacity onPress={() => setShow(!show)}>
          <Ionicons
            name={show ? 'eye' : 'eye-off'}
            size={22}
            color="#888"
            style={{ paddingHorizontal: 6 }}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View />
      </View>

      {/* Form */}
      <View style={styles.form}>
        {renderInput('Current Password', currentPwd, setCurrentPwd, 'Current password', showCurrent, setShowCurrent)}
        {renderInput('New Password', newPwd, setNewPwd, 'New password', showNew, setShowNew)}
        {renderInput('Confirm New Password', confirmPwd, setConfirmPwd, 'Confirm new password', showConfirm, setShowConfirm)}

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.WHITE} />
          ) : (
            <Text style={styles.buttonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* Styles */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    marginBottom: 24,
    backgroundColor: Colors.PRIMARY,
    paddingVertical: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    height: Dimenstion.headerHeight,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.WHITE,
    marginLeft: 16,
  },
  form: { flex: 1, padding: 20 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 6 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 1,
    paddingRight: 6,
  },
  input: {
    padding: 14,
    fontSize: 16,
    color:'black'
  },
  button: {
    backgroundColor: Colors.PRIMARY,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: { backgroundColor: '#999' },
  buttonText: { color: Colors.WHITE, fontSize: 16, fontWeight: '600' },
});

