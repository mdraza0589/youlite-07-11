import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import Colors from '@/utils/Colors'; // Assuming you have a Colors utility
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

const TermsAndConditions = () => {
    return (
        <View style={styles.container}>
            <StatusBar barStyle={'dark-content'} backgroundColor={''} />
            <SafeAreaView >

                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={Colors.PRIMARY} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Terms & Conditions</Text>
                    <View style={{ width: 24 }} /> {/* Placeholder for spacing */}
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.title}>Terms & Conditions</Text>

                    <Text style={styles.paragraph}>
                        Thank you for accessing/shopping at YOULITE ENERGY PRIVATE LIMITED. This site is owned and operated by YOULITE ENERGY PRIVATE LIMITED (hereinafter referred to as “the Company”). By accessing or shopping on this site, you indicate your unconditional acceptance of these Terms & Conditions. We reserve the right, at our sole discretion, to update or revise these Terms & Conditions at any time. Continued use of the site following the posting of any changes shall constitute your acceptance of those changes.
                    </Text>

                    <Text style={styles.paragraph}>
                        At YOULITE ENERGY PRIVATE LIMITED, we strive to create a space where you can explore and shop for all your favorite products in a safe and secure environment. All products and information displayed on this website constitute an “invitation to offer.” The Company reserves the right to accept or reject your offer. Your order for purchase constitutes your “offer,” which shall be subject to the Terms & Conditions listed below.
                    </Text>

                    <Text style={styles.heading}>Eligibility to Use Our Site</Text>
                    <Text style={styles.paragraph}>
                        Use of the Site is available only to persons who can legally enter into contracts under applicable laws. Persons who are “incompetent to contract” within the meaning of the Indian Contract Act, 1872, including undischarged insolvents, etc., are not eligible to use the Site. The Company reserves the right to terminate your access if it is discovered that you are under the age of 18 years or otherwise disqualified under the Indian Contract Act, 1872.
                    </Text>

                    <Text style={styles.heading}>Membership</Text>
                    <Text style={styles.paragraph}>
                        It is not essential to create an account to shop with us; you may shop as a guest. However, if you choose to register, you agree to provide true, accurate, current, and complete information about yourself as prompted by the registration form. Registration where prohibited under law shall be void. YOULITE ENERGY PRIVATE LIMITED reserves the right to revoke or terminate your registration for any reason, at any time, without notice.
                    </Text>

                    <Text style={styles.heading}>Electronic Communications</Text>
                    <Text style={styles.paragraph}>
                        When you use the site, send emails, or otherwise communicate with us electronically, you consent to receive communications from us electronically as well. We may communicate with you via email, SMS, or by posting notices on the site, as required.
                    </Text>

                    <Text style={styles.heading}>Reviews, Feedback, Submissions</Text>
                    <Text style={styles.paragraph}>
                        All reviews, comments, feedback, suggestions, ideas, and other submissions disclosed, submitted, or offered to YOULITE ENERGY PRIVATE LIMITED in connection with your use of the site (collectively referred to as “Comments”) shall remain the property of the Company.
                    </Text>

                    <Text style={styles.paragraph}>
                        Such disclosure or submission constitutes an assignment to the Company of all worldwide rights, titles, and interests in copyrights and other intellectual properties contained in the Comments. The Company will be entitled to use, reproduce, disclose, modify, adapt, create derivative works from, publish, display, and distribute any Comments you submit, for any purpose whatsoever, without restriction or compensation to you.
                    </Text>

                    <Text style={styles.paragraph}>
                        By submitting Comments, you agree that your submissions will not violate any third-party rights, including copyrights, trademarks, or privacy rights; will not contain defamatory, unlawful, abusive, obscene, or harmful material, or software viruses; will not use false information or impersonate another person/entity. You remain solely responsible for the content you submit and agree to indemnify YOULITE ENERGY PRIVATE LIMITED against all claims arising from such submissions.
                    </Text>

                    <Text style={styles.heading}>Accuracy of Content / Product Information</Text>
                    <Text style={styles.paragraph}>
                        While YOULITE ENERGY PRIVATE LIMITED strives to provide accurate product and pricing information, typographical or technical errors may occur. If a product is listed at an incorrect price or with incorrect details due to an error, the Company reserves the right, at its sole discretion, to correct the price or product information, or to refuse/cancel any orders placed for such products (unless the product has already been dispatched).
                    </Text>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
};

export default TermsAndConditions;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        paddingBottom: 50

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
    scrollContent: {
        paddingHorizontal: 16,
        paddingVertical: 20,
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
    paragraph: {
        fontSize: 14,
        lineHeight: 22,
        color: '#333',
        marginBottom: 12,
    },

})
