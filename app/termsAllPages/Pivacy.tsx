import React from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity, StatusBar } from 'react-native';
import Colors from '@/utils/Colors'; // Use your Colors utility if available
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
const Privacy = () => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle={'dark-content'} backgroundColor={''} />
      <SafeAreaView>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.PRIMARY} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Privacy and Policy</Text>
          <View style={{ width: 24 }} /> {/* Placeholder for spacing */}
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Privacy & Cookie Policy</Text>

          <Text style={styles.paragraph}>
            We respect and are committed to protecting your privacy. Publishing, selling, or renting any personal data or information to any third party, without your consent, is against our ethics.
          </Text>

          <Text style={styles.paragraph}>
            This policy applies to our services under the domain and subdomains of the Site. By visiting this Site, you agree to be bound by this policy. If you do not agree, please do not use the site.
          </Text>

          <Text style={styles.paragraph}>
            This policy does not apply to sites maintained by other companies to which we link. Please review their privacy policies before submitting personal information.
          </Text>

          <Text style={styles.heading}>Privacy Guarantee</Text>
          <Text style={styles.paragraph}>
            We will not sell or rent your personal information to third parties for marketing purposes without your explicit consent. General statistical information about visitors may be shared, but access to personal information is restricted to employees who require it for their duties.
          </Text>

          <Text style={styles.heading}>Information We Collect</Text>
          <Text style={styles.paragraph}>
            Personal Information is used to process your order and provide the best possible service. We have appropriate physical, electronic, and managerial procedures to safeguard the information we collect online.
          </Text>

          <Text style={styles.paragraph}>
            We use cookies to analyze website flow, measure promotions, and enhance trust and safety. Session cookies are deleted automatically at the end of a session, while persistent cookies remain until expiry or deletion.
          </Text>

          <Text style={styles.heading}>COOKIE POLICY</Text>
          <Text style={styles.paragraph}>
            Cookies help make your online experience efficient and relevant. They remember preferences, shopping baskets, and assist navigation.
          </Text>

          <Text style={styles.heading}>Types of Cookies</Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Session Cookies:</Text> Temporary cookies erased when you close your browser.{'\n'}
            <Text style={styles.bold}>Persistent Cookies:</Text> Remain until expiry or manual deletion. Used to analyze usage patterns and improve the site.
          </Text>

          <Text style={styles.heading}>Cookie Categories</Text>
          <Text style={styles.paragraph}>
            <Text style={styles.bold}>Essential:</Text> Required for regular website operation.{'\n'}
            <Text style={styles.bold}>Functional:</Text> Remember preferences for a better experience.{'\n'}
            <Text style={styles.bold}>Analytics:</Text> Measure performance, traffic, and content popularity. Example: Google Analytics.{'\n'}
            <Text style={styles.bold}>Advertising:</Text> Serve relevant ads and record interactions. Placed by us or trusted partners.
          </Text>

          <Text style={styles.paragraph}>
            Third-party cookies are restricted to trusted partners. We also use validated third-party information for advertising purposes.
          </Text>

          <Text style={styles.paragraph}>
            To delete cookies, refer to your browser settings (steps vary by browser). You can also change other privacy and security settings.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

export default Privacy;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingBottom:50
  },
  scrollContent: {
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    color: Colors.PRIMARY,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    color: Colors.PRIMARY,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.PRIMARY,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    color: '#333',
    marginBottom: 12,
  },
  bold: {
    fontWeight: '600',
  },
});
