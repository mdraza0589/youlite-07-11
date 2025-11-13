import Colors from '@/utils/Colors';
import Dimenstion from '@/utils/Dimenstion';
import React from 'react'
import { Dimensions, StyleSheet } from 'react-native';
const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f8f8' },

    /* header */
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
    headerButton: { padding: 8 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: Colors.WHITE },
    cartCountText: { fontSize: 16, fontWeight: '600', color: Colors.WHITE },

    loader: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    loaderImage: { width: 60, height: 60, marginBottom: 12 },
    loaderText: { fontSize: 16, color: '#666' },

    /* quick links */
    buttonContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 10,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    optionButton: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
    optionText: { fontSize: 14, color: Colors.PRIMARY, fontWeight: '500', marginTop: 4 },

    /* error */
    errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    errorText: { color: '#c00', fontSize: 16, textAlign: 'center', marginBottom: 16 },
    retryButton: { backgroundColor: Colors.PRIMARY, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
    retryText: { color: Colors.WHITE, fontWeight: 'bold', fontSize: 16 },

    /* items list */
    itemsContainer: { flex: 1, paddingHorizontal: 10, paddingTop: 10 },
    itemCard: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 12,
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    imageContainer: { marginRight: 16 },
    itemImage: { width: 100, height: 100, borderRadius: 8 },
    itemDetails: { flex: 1, justifyContent: 'space-between' },
    itemName: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
    itemSizeColor: { fontSize: 14, color: '#666', marginBottom: 8 },
    priceContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    itemPrice: { fontSize: 18, fontWeight: 'bold', marginRight: 8 },
    originalPrice: { fontSize: 14, color: '#999', textDecorationLine: 'line-through', marginRight: 8 },
    discountText: { fontSize: 14, color: '#00a650', fontWeight: 'bold' },

    quantityContainer: { flexDirection: 'row', alignItems: 'center' },
    quantityButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#ddd',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f8f8f8',
    },
    quantityText: { width: 50, textAlign: 'center', fontSize: 18, fontWeight: '600' },
    removeButton: { marginLeft: 'auto', paddingVertical: 8, paddingHorizontal: 12 },
    removeText: { color: '#ff3f6c', fontWeight: 'bold', fontSize: 14 },

    /* loading sections */
    loadingSection: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    loadingText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#666',
    },
    infoSection: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        alignItems: 'center',
    },
    infoText: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    },

    /* shipping methods */
    shippingMethodsSection: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    shippingMethodOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 8,
        marginBottom: 8,
    },
    selectedShippingMethod: {
        borderColor: Colors.PRIMARY,
        backgroundColor: '#f0f8ff',
    },
    shippingMethodRadio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#ccc',
        marginRight: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    shippingMethodRadioSelected: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: Colors.PRIMARY,
    },
    shippingMethodInfo: { flex: 1 },
    shippingMethodTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    shippingMethodDescription: { fontSize: 12, color: '#666' },
    shippingMethodCost: { fontSize: 16, fontWeight: 'bold', color: Colors.PRIMARY },

    /* payment method section */
    paymentMethodSection: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    paymentMethodCard: {
        padding: 12,
        borderWidth: 1,
        borderColor: Colors.PRIMARY,
        borderRadius: 8,
        backgroundColor: '#f0f8ff',
    },
    paymentMethodHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    paymentMethodTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Colors.PRIMARY,
        marginLeft: 8,
    },
    paymentMethodDescription: {
        fontSize: 14,
        color: '#666',
        marginBottom: 8,
    },
    codBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#00a650',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    codBadgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },

    /* sections */
    couponSection: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    taxSection: {
        borderRadius: 12,
        padding: 16,
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#333' },

    couponItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    couponIcon: { marginRight: 8 },
    couponCode: { fontSize: 14, fontWeight: '500', flex: 1 },
    removeCouponButton: { paddingHorizontal: 8, paddingVertical: 4 },
    removeCouponText: { color: '#c00', fontSize: 12, fontWeight: 'bold' },

    taxItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    taxIcon: { marginRight: 8 },
    taxLabel: { fontSize: 13, color: '#666', flex: 1 },
    taxAmount: { fontSize: 13, fontWeight: '500' },

    /* GST Breakdown */
    gstBreakdownHeader: {
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        marginTop: 8,
        paddingTop: 8,
        marginBottom: 6,
    },
    gstBreakdownTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.PRIMARY,
    },
    totalTaxRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 6,
        paddingTop: 6,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    totalTaxLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    totalTaxAmount: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.PRIMARY,
    },

    /* bottom container */
    bottomContainer: {
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        paddingBottom: 12,
    },
    toggleHandle: {
        alignSelf: 'center',
        paddingVertical: 4,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginTop: 2,
    },

    /* summary */
    summaryContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    summaryLabel: { fontSize: 15, color: '#666' },
    summaryValue: { fontSize: 15, fontWeight: '500' },
    discountValue: { color: '#00a650' },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
        marginBottom: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    totalLabel: { fontSize: 18, fontWeight: 'bold' },
    totalValue: { fontSize: 20, fontWeight: 'bold', color: Colors.PRIMARY },
    paymentSummary: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    paymentSummaryLabel: { fontSize: 14, color: '#666' },
    paymentSummaryValue: { fontSize: 14, fontWeight: '500', color: Colors.PRIMARY },

    checkoutButton: {
        backgroundColor: Colors.PRIMARY,
        padding: 10,
        borderRadius: 8,
        alignItems: 'center',
        marginHorizontal: 16,
    },
    checkoutText: { color: Colors.WHITE, fontWeight: 'bold', fontSize: 16 },
    secureText: { textAlign: 'center', fontSize: 12, color: '#666', marginBottom: 0, marginTop: 8 },

    /* empty */
    emptyCart: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptyText: { fontSize: 22, fontWeight: 'bold', marginTop: 24, marginBottom: 8, color: '#333' },
    emptySubtext: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 24 },
    shopButton: {
        backgroundColor: Colors.PRIMARY,
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 8,
    },
    shopButtonText: { color: Colors.WHITE, fontWeight: 'bold', fontSize: 16 },

    spacer: { height: 100 },
});

export default styles;

