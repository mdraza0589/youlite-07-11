import React from 'react';
import { View, Text, ScrollView, StyleSheet, Linking, TouchableOpacity, StatusBar } from 'react-native';
import Colors from '@/utils/Colors'; // Assuming you have a Colors utility
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
const Shipping = () => {
    return (
        <View style={styles.container}>
            <StatusBar barStyle={'dark-content'} backgroundColor={''} />
            <SafeAreaView>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={Colors.PRIMARY} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Shipping & Delivery</Text>
                    <View style={{ width: 24 }} /> {/* Placeholder for spacing */}
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.title}>Return, Refund, and Shipping Policy</Text>

                    <Text style={styles.heading}>Return</Text>
                    <Text style={styles.paragraph}>
                        The product must be returned to us within 7 days from the date it was delivered to the customer. Product must be returned with all tags attached, in its original condition, along with all packing material, courier receipt, invoice & other papers.
                    </Text>

                    <Text style={styles.heading}>Refund</Text>
                    <Text style={styles.paragraph}>
                        Once the Product is received by the company successfully, YOULITE ENERGY PRIVATE LIMITED will instantly initiate the refund to your source account or chosen method of refund.
                    </Text>

                    <Text style={styles.heading}>LED Strip Lights / Service Provider Policy</Text>
                    <Text style={styles.paragraph}>
                        Due to the nature of services provided, “NO REFUND” and “NO CANCELLATION” will be entertained once the payment has been made.
                    </Text>

                    <Text style={styles.heading}>Cancellation Policy</Text>
                    <Text style={styles.paragraph}>
                        Please note that an order can only be canceled within 24 hours of placing the order. Once the order is processed after 24 hours, no cancellation request will be entertained. However, returns are possible for all orders/products.
                    </Text>
                    <Text style={styles.paragraph}>
                        Customers can CANCEL the order only before the Order has been shipped/dispatched. After the Product/s have been shipped, the Customer CANNOT cancel the Orders. However, returns are possible for all orders/products.
                    </Text>

                    <Text style={styles.heading}>Shipping & Delivery Policies</Text>
                    <Text style={styles.paragraph}>
                        YOULITE ENERGY PRIVATE LIMITED ships its products to almost all parts of India. Orders placed will be shipped within 24 hours. We ship on all days except Sundays and National Holidays.
                    </Text>
                    <Text style={styles.paragraph}>
                        For all areas serviced by reputed couriers, the delivery time would be within 3 to 4 business days of shipping (business days exclude Sundays and other holidays). For other areas, the products may take 1-2 weeks, depending on location. At times, there might be unexpected delays in delivery due to unavoidable logistics challenges beyond our control, for which YOULITE ENERGY PRIVATE LIMITED is not liable. We request users to cooperate as we continuously try to avoid such instances. YOULITE ENERGY PRIVATE LIMITED reserves the right to cancel your order at its sole discretion if delivery takes longer than usual or the shipment is untraceable, and refund the amount paid to your source account.
                    </Text>

                    <Text style={styles.heading}>Contact Us</Text>
                    <Text style={styles.paragraph}>
                        YOULITE ENERGY PRIVATE LIMITED{'\n'}
                        Plot No. 17, First Floor, DLF Industrial Area, Moti Nagar, New Delhi – 110015, India{'\n'}
                        Phone: <Text style={styles.link} onPress={() => Linking.openURL('tel:+911143587138')}>+91 1143587138</Text>, <Text style={styles.link} onPress={() => Linking.openURL('tel:+918269233078')}>+91 8269233078</Text>
                    </Text>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
};

export default Shipping;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        paddingBottom: 50

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
    link: {
        color: Colors.PRIMARY,
        textDecorationLine: 'underline',
    },
});
