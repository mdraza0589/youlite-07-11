// Modified app/(tabs)/Profile.tsx
// Enhanced UI with better icons, improved layout, and additional features
// Fixed email display to show the actual email from registration
// Added pull-to-refresh functionality

import Colors from '@/utils/Colors';
import Dimenstion from '@/utils/Dimenstion';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import Feather from '@expo/vector-icons/Feather';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View
} from 'react-native';

import {
  clearSession,
  getCustomerById,
  getSession,
  updateCustomerById,
} from '@/lib/services/authService';
import Loading from '../components/Loading';

// Types
interface WCAddress {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  state?: string;
  email?: string;
  phone?: string;
}

interface WCMeta {
  id?: number;
  key: string;
  value: any;
}

interface WCCustomer {
  id: number;
  date_created?: string;
  date_created_gmt?: string;
  date_modified?: string;
  date_modified_gmt?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  username?: string;
  billing?: WCAddress;
  shipping?: WCAddress;
  is_paying_customer?: boolean;
  avatar_url?: string;
  meta_data?: WCMeta[];
}

interface StoredSession {
  user: {
    id: number;
    email: string;
    name?: string;
    first_name?: string;
    last_name?: string;
  };
  token?: string;
}

interface RowProps {
  label: string;
  value?: string | number | boolean;
}

const initialsFrom = (name: string, email?: string): string => {
  const trimmed = (name || '').trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('');
  }
  if (email) return (email[0] || '?').toUpperCase();
  return '?';
};

const Row: React.FC<RowProps> = ({ label, value }) => (
  <View style={styles.infoItem}>
    <Text style={[styles.infoLabel, { flex: 1 }]}>{label}</Text>
    <Text style={[styles.infoValue, { textAlign: 'right' }]}>
      {value === '' || value === undefined ? '—' : String(value)}
    </Text>
  </View>
);

// Helpers
const findMeta = (meta: WCMeta[] | undefined, key: string): WCMeta | undefined =>
  (meta || []).find((m) => m.key === key);

const upsertMeta = (meta: WCMeta[] | undefined, key: string, value: any): WCMeta[] => {
  const list = Array.isArray(meta) ? [...meta] : [];
  const existingIdx = list.findIndex((m) => m.key === key);
  if (existingIdx >= 0) {
    list[existingIdx] = { id: list[existingIdx].id, key, value };
  } else {
    list.push({ key, value });
  }
  return list;
};

const ensureString = (v: any): string => (typeof v === 'string' ? v : '');

const dataUrlFrom = (mime: string, base64: string): string => `data:${mime};base64,${base64}`;

const ProfileScreen: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [customer, setCustomer] = useState<WCCustomer | null>(null);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [navigated, setNavigated] = useState<boolean>(false);
  const [uploadingAvatar, setUploadingAvatar] = useState<boolean>(false);
  const [expandedBilling, setExpandedBilling] = useState<boolean>(false);
  const [expandedShipping, setExpandedShipping] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const refreshProfile = useCallback(async (): Promise<void> => {
    try {
      const userSession = await getSession();
      if (!userSession?.user?.id) {
        if (!navigated) {
          setNavigated(true);
          setTimeout(() => router.replace('/Login/MobileRegistrationScreen'), 0);
        }
        return;
      }
      setSession(userSession);
      const data = await getCustomerById(userSession.user.id);
      const avatarMeta = findMeta(data.meta_data, 'avatar_file');
      const metaVal = ensureString(avatarMeta?.value);
      if (metaVal) {
        data.avatar_url = metaVal;
      } else if (!data.avatar_url) {
        data.avatar_url = '';
      }
      setCustomer(data);

      // Debug logs to verify email
      console.log('Profile - Customer email:', data.email);
      console.log('Profile - Session email:', userSession.user.email);
    } catch (err: any) {
      console.log('Profile refresh error:', err?.message || err);
    }
  }, [navigated]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      await refreshProfile();
      if (isMounted) setLoading(false);
    })();
    return () => { isMounted = false; };
  }, [refreshProfile]);

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [refreshProfile])
  );

  // Add pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  }, [refreshProfile]);

  const display = useMemo(() => {
    if (!customer && session) {
      return {
        name: session.user.name || `${session.user.first_name || ''} ${session.user.last_name || ''}`.trim() || session.user.email,
        email: session.user.email,
        avatar: '',
        joinDate: '',
        phone: ''
      };
    }
    const email = customer?.email || '';
    const name = [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || customer?.username || email;
    const avatar = ensureString(customer?.avatar_url);
    const phone = customer?.billing?.phone || customer?.shipping?.phone || '';
    return { name, email, avatar, phone };
  }, [customer, session]);

  const onLogout = async (): Promise<void> => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearSession();
              if (!navigated) {
                setNavigated(true);
                setTimeout(() => router.replace('/Login/MobileRegistrationScreen'), 0);
              }
            } catch {
              Alert.alert('Error', 'Failed to logout, please try again.');
            }
          },
        },
      ]
    );
  };

  const onChangeAvatar = async (): Promise<void> => {
    if (!customer) return;
    try {
      if (!ImagePicker || typeof ImagePicker.launchImageLibraryAsync !== 'function') {
        throw new Error('Image picker not available.');
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission required', 'Please allow photo library access to update your profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
        base64: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const uri: string = asset.uri;
      const inferredMime =
        asset.mimeType ||
        (uri.endsWith('.png') ? 'image/png' :
          uri.endsWith('.webp') ? 'image/webp' :
            'image/jpeg');
      setUploadingAvatar(true);

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

      const dataUrl = dataUrlFrom(inferredMime, base64);
      const updatedMeta = upsertMeta(customer.meta_data, 'avatar_file', dataUrl);
      const updates: any = {
        avatar_url: dataUrl,
        meta_data: updatedMeta.map((m) => (m.id ? { id: m.id, key: m.key, value: m.value } : { key: m.key, value: m.value })),
      };
      const updated = await updateCustomerById(customer.id, updates);
      const persistedFile = findMeta(updated.meta_data, 'avatar_file');
      const persistedVal = ensureString(persistedFile?.value);
      updated.avatar_url = persistedVal || ensureString(updated.avatar_url);
      setCustomer(updated);
      Alert.alert('Success', 'Profile picture updated.');
    } catch (err: any) {
      console.log('Avatar update error:', err?.response?.status || 0, err?.message || err);
      Alert.alert('Error', err?.message || 'Failed to update profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const toggleAccordion = (section: 'billing' | 'shipping'): void => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (section === 'billing') {
      setExpandedBilling(!expandedBilling);
    } else {
      setExpandedShipping(!expandedShipping);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]} >
        <Loading />
      </View >
    );
  }

  if (!session) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <Text style={{ fontSize: 16, color: '#333', marginBottom: 16 }}>No user session found.</Text>
        <TouchableOpacity onPress={() => router.replace('/Login/MobileRegistrationScreen')} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasAvatar = typeof display.avatar === 'string' && display.avatar.trim().length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View></View>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View></View>
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.PRIMARY]}
            tintColor={Colors.PRIMARY}
          />
        }
      >
        <View>
          {/* Profile Section */}
          <View style={styles.profileSection}>
            <View style={styles.avatarContainer}>
              {hasAvatar ? (
                <Image source={{ uri: display.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={{ color: Colors.WHITE, fontWeight: 'bold', fontSize: 24 }}>
                    {initialsFrom(display.name, display.email)}
                  </Text>
                </View>
              )}
              <TouchableOpacity style={styles.editIcon} onPress={onChangeAvatar} disabled={uploadingAvatar}>
                <Ionicons name={uploadingAvatar ? 'cloud-upload-outline' : 'camera-outline'} size={18} color="#fff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.userName}>{display.name}</Text>
            {display.email ? (
              <Text style={styles.userEmail}>{display.email}</Text>
            ) : null}
          </View>

          {/* Personal Information */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <Ionicons name="person-outline" size={20} color={Colors.PRIMARY} style={styles.sectionIcon} />
                <Text style={styles.sectionTitle}>Personal Information</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/pages/Profile/AccountInfo')}>
                <Ionicons name="pencil-outline" size={20} color={Colors.PRIMARY} />
              </TouchableOpacity>
            </View>

            <View style={styles.infoItem}>
              <Ionicons name="person-outline" size={20} color="#666" style={styles.infoIcon} />
              <Text style={styles.infoText}>{display.name}</Text>
            </View>

            {/* Always show email if available - removed @example.com filter */}
            <TouchableOpacity style={styles.infoItem} onPress={() => router.push('/pages/Profile/AccountInfo')}>
              <Ionicons name="mail-outline" size={20} color="#666" style={styles.infoIcon} />
              {display.email !== '' ? (
                <View >
                  <Text style={styles.infoText}>{display.email}</Text>
                </View>
              ) :
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 50 }}>
                  <Text style={styles.infoText}>Add Your Email *</Text>
                  <Feather name="alert-triangle" size={16} color="black" />
                </View>
              }
            </TouchableOpacity>

            <View style={[styles.infoItem, { borderBottomWidth: 0 }]}>
              <Ionicons name="call-outline" size={20} color="#666" style={styles.infoIcon} />
              <Text style={styles.infoText}>{display.phone || '—'}</Text>
            </View>
          </View>

          {/* Address Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <Ionicons name="location-outline" size={20} color={Colors.PRIMARY} style={styles.sectionIcon} />
                <Text style={styles.sectionTitle}>Addresses</Text>
              </View>
            </View>

            {/* Billing Address */}
            <View style={styles.accordionItem}>
              <View style={styles.accordionHeader}>
                <View style={styles.accordionTitleContainer}>
                  <Ionicons name="card-outline" size={18} color="#666" style={styles.accordionIcon} />
                  <Text style={styles.accordionTitle}>Billing Address</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => router.push('/pages/Profile/BillingAddress')} style={{ marginRight: 16 }}>
                    <Ionicons name="pencil-outline" size={20} color={Colors.PRIMARY} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleAccordion('billing')}>
                    <Ionicons style={{ fontWeight: '700' }} name={expandedBilling ? 'chevron-up' : 'chevron-down'} size={24} color={Colors.PRIMARY} />
                  </TouchableOpacity>
                </View>
              </View>

              {expandedBilling && (
                <View style={styles.accordionContent}>
                  <Row label="First name" value={customer?.billing?.first_name || ''} />
                  <Row label="Last name" value={customer?.billing?.last_name || ''} />
                  <Row label="Company" value={customer?.billing?.company || ''} />
                  <Row label="Address 1" value={customer?.billing?.address_1 || ''} />
                  <Row label="Address 2" value={customer?.billing?.address_2 || ''} />
                  <Row label="City" value={customer?.billing?.city || ''} />
                  <Row label="Postcode" value={customer?.billing?.postcode || ''} />
                  <Row label="Country" value={customer?.billing?.country || ''} />
                  <Row label="State" value={customer?.billing?.state || ''} />
                  <Row label="Email" value={customer?.billing?.email || ''} />
                  <Row label="Phone" value={customer?.billing?.phone || ''} />
                </View>
              )}
            </View>

            <View style={styles.divider} />

            {/* Shipping Address */}
            <View style={styles.accordionItem}>
              <View style={styles.accordionHeader}>
                <View style={styles.accordionTitleContainer}>
                  <Ionicons name="car-outline" size={18} color="#666" style={styles.accordionIcon} />
                  <Text style={styles.accordionTitle}>Shipping Address</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => router.push('/pages/Profile/ShippingAddress')} style={{ marginRight: 16 }}>
                    <Ionicons name="pencil-outline" size={20} color={Colors.PRIMARY} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleAccordion('shipping')}>
                    <Ionicons name={expandedShipping ? 'chevron-up' : 'chevron-down'} size={24} color={Colors.PRIMARY} />
                  </TouchableOpacity>
                </View>
              </View>

              {expandedShipping && (
                <View style={styles.accordionContent}>
                  <Row label="First name" value={customer?.shipping?.first_name || ''} />
                  <Row label="Last name" value={customer?.shipping?.last_name || ''} />
                  <Row label="Company" value={customer?.shipping?.company || ''} />
                  <Row label="Address 1" value={customer?.shipping?.address_1 || ''} />
                  <Row label="Address 2" value={customer?.shipping?.address_2 || ''} />
                  <Row label="City" value={customer?.shipping?.city || ''} />
                  <Row label="Postcode" value={customer?.shipping?.postcode || ''} />
                  <Row label="Country" value={customer?.shipping?.country || ''} />
                  <Row label="State" value={customer?.shipping?.state || ''} />
                  <Row label="Email" value={customer?.shipping?.email || customer?.billing?.email || ''} />
                  <Row label="Phone" value={customer?.shipping?.phone || ''} />
                </View>
              )}
            </View>
          </View>

          {/* Account Management */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <Ionicons name="key-outline" size={20} color={Colors.PRIMARY} style={styles.sectionIcon} />
                <Text style={styles.sectionTitle}>Account Management</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.settingItem} onPress={() => router.push('/pages/Profile/About')}>
              <View style={styles.settingIconContainer}>
                <Ionicons name="information-circle-outline" size={22} color={Colors.PRIMARY} />
              </View>
              <Text style={styles.settingText}>About App</Text>
              <Ionicons name="chevron-forward" size={18} color="#999" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingItem} onPress={() => router.push('/pages/Profile/ChangePassword')}>
              <View style={styles.settingIconContainer}>
                <Ionicons name="lock-closed-outline" size={22} color={Colors.PRIMARY} />
              </View>
              <Text style={styles.settingText}>Change Password</Text>
              <Ionicons name="chevron-forward" size={18} color="#999" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.settingItem} onPress={() => router.push('/pages/orderHistory/orderHistory')}>
              <View style={styles.settingIconContainer}>
                <Ionicons name="bag-handle-outline" size={22} color={Colors.PRIMARY} />
              </View>
              <Text style={styles.settingText}>Order History</Text>
              <Ionicons name="chevron-forward" size={18} color="#999" />
            </TouchableOpacity>
          </View>

          {/* Support */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleContainer}>
                <Ionicons name="help-buoy-outline" size={20} color={Colors.PRIMARY} style={styles.sectionIcon} />
                <Text style={styles.sectionTitle}>Support</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.settingItem} onPress={() => router.push('/pages/Profile/Contact')}>
              <View style={styles.settingIconContainer}>
                <Ionicons name="help-circle-outline" size={22} color={Colors.PRIMARY} />
              </View>
              <Text style={styles.settingText}>Help & Support</Text>
              <Ionicons name="chevron-forward" size={18} color="#999" />
            </TouchableOpacity>
          </View>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

// Enhanced Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  header: {
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
    fontSize: 22,
    fontWeight: '700',
    color: Colors.WHITE
  },
  refreshButton: {
    padding: 4,
  },
  scrollContainer: {
    flex: 1,
    paddingHorizontal: 0
  },
  scrollContent: {
    padding: 6,
    paddingBottom: 32
  },
  profileSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8,
    alignItems: 'center',
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 10,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#f0f0f0'
  },
  avatarFallback: {
    backgroundColor: Colors.PRIMARY,
    justifyContent: 'center',
    alignItems: 'center',
    width: 120,
    height: 120,
    borderRadius: 60
  },
  editIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.PRIMARY,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 2,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
    marginBottom: 4,
    textAlign: 'center'
  },
  userEmail: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center'
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  sectionIcon: {
    marginRight: 8
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#222'
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoIcon: {
    marginRight: 12,
    width: 24
  },
  infoText: {
    fontSize: 16,
    color: '#333',
    flex: 1
  },
  // NEW: Separate styles for Row component
  infoLabel: {
    fontSize: 16,
    color: '#666',
    flex: 1
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
  },
  accordionItem: {
    marginBottom: 8
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  accordionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  accordionIcon: {
    marginRight: 8,
    width: 20
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333'
  },
  accordionContent: {
    paddingTop: 8,
    paddingLeft: 28
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 8
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingIconContainer: {
    width: 32,
    alignItems: 'center',
    marginRight: 12
  },
  settingText: {
    fontSize: 16,
    color: '#333',
    flex: 1
  },
  logoutButton: {
    flexDirection: 'row',
    backgroundColor: Colors.PRIMARY,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }
  },
  logoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
});

export default ProfileScreen;

