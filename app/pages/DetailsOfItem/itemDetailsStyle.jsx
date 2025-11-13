import Colors from '@/utils/Colors';
const { width } = Dimensions.get('window');
import { Video } from 'expo-av';
import { Modal, TouchableWithoutFeedback } from 'react-native';
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
} from 'react-native';

const styles = StyleSheet.create({
    button: {
        backgroundColor: Colors.PRIMARY,
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 10,
        alignItems: "center",
        marginTop: 20,
    },
    buttonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    imageSection: { backgroundColor: 'white', paddingBottom: 10, position: 'relative' },
    backButton: {
        position: 'absolute', top: 30, left: 20, zIndex: 10,
        backgroundColor: 'rgba(0,0,0,0.5)', width: 40, height: 40, borderRadius: 20,
        justifyContent: 'center', alignItems: 'center',
    },
    thumbnailList: { paddingHorizontal: 10, marginTop: 10 },
    // thumbnail: { width: 60, height: 60, marginRight: 10, borderRadius: 8 },
    selectedThumbnail: { borderWidth: 2, borderColor: '#4a6cf7' },
    infoSection: { backgroundColor: 'white', padding: 16, marginTop: 10 },
    productName: { fontSize: 22, fontWeight: '700', color: '#2d3748', marginBottom: 10 },
    priceContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    price: { fontSize: 20, fontWeight: 'bold', color: '#4a6cf7', marginRight: 10 },
    originalPrice: { fontSize: 18, color: '#a0aec0', textDecorationLine: 'line-through', marginRight: 10 },
    discountBadge: { backgroundColor: '#e53e3e', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    discountText: { color: 'white', fontWeight: '600', fontSize: 12 },
    ratingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 10,
    },
    videoThumbnailContainer: {
        width: 80,
        height: 80,
        borderRadius: 10,
        backgroundColor: '#000',
        position: 'relative',
        overflow: 'hidden',
    },
    videoThumbnailImage: {
        width: '100%',
        height: '100%',
        borderRadius: 10,
    },
    videoThumbnailPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1a1a',
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#404040',
    },
    videoPlayOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)', // Semi-transparent overlay
    },
    stars: { flexDirection: 'row', marginRight: 10 },
    ratingText: { color: '#4a5568', fontSize: 16 },
    categoryContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    categoryText: {
        fontSize: 16,
        color: '#475569',
        marginLeft: 6,
        fontWeight: '500',
    },
    selectedVideoThumbnail: {
        borderWidth: 2,
        borderColor: '#4a6cf7',
    },
    depositSection: { marginBottom: 20 },
    depositOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 8,
        marginBottom: 10,
    },
    selectedDepositOption: {
        borderColor: '#4a6cf7',
        backgroundColor: '#f0f4ff',
    },
    radioContainer: {
        marginRight: 12,
    },
    radio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#cbd5e0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pickerTextColor: {
        color: 'black'
    },
    radioSelected: {
        borderColor: '#4a6cf7',
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#4a6cf7',
    },
    depositOptionContent: {
        flex: 1,
    },
    depositOptionLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#2d3748',
        marginBottom: 4,
    },
    videoThumbnail: {
        width: 80,
        height: 80,
        borderRadius: 10,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoLabel: {
        color: Colors.WHITE,
        fontSize: 12,
        marginTop: 4,
    },


    depositOptionAmount: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#4a6cf7',
    },
    remainingAmount: {
        fontSize: 14,
        color: '#718096',
        marginTop: 2,
    },

    colorSection: { marginBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: '#2d3748', marginBottom: 10 },
    picker: { height: 50, width: '100%', backgroundColor: '#f7fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
    quantitySection: { marginBottom: 20 },
    quantitySelector: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, alignSelf: 'flex-start' },
    quantityButton: { padding: 10 },
    quantityText: { paddingHorizontal: 15, fontSize: 16, fontWeight: '600' },
    deliverySection: { marginBottom: 20 },
    deliveryInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f7fafc', padding: 15, borderRadius: 8 },
    deliveryTextContainer: { flex: 1, marginLeft: 10 },
    deliveryAddress: { fontSize: 14, color: '#2d3748', marginBottom: 4 },
    deliveryDate: { fontSize: 14, color: '#4a5568' },
    changeText: { color: '#4a6cf7', fontWeight: '600' },
    descriptionSection: { marginBottom: 20 },
    descriptionText: { fontSize: 16, color: '#4a5568', lineHeight: 24 },
    reviewsSection: { marginBottom: 20 },
    reviewItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    reviewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
    reviewReviewer: { fontSize: 16, fontWeight: '600', flex: 1 },
    reviewStars: { flexDirection: 'row', marginRight: 10 },
    reviewDate: { fontSize: 12, color: '#718096' },
    reviewComment: { fontSize: 14, color: '#4a5568' },
    relatedSection: { backgroundColor: 'white', padding: 16, marginTop: 10, marginBottom: 80 },
    relatedProduct: { width: 150, marginRight: 15, position: 'relative' },
    relatedProductImage: { width: 150, height: 150, borderRadius: 8, marginBottom: 8 },
    relatedProductName: { fontSize: 14, fontWeight: '500', color: '#2d3748', marginBottom: 4 },
    relatedProductRating: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    relatedProductRatingText: { fontSize: 12, color: '#4a5568', marginLeft: 4 },
    relatedProductPrice: { fontSize: 16, fontWeight: 'bold', color: '#4a6cf7', marginBottom: 8 },
    addToCartButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.PRIMARY, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
    addToCartText: { fontSize: 12, fontWeight: '600', color: Colors.WHITE, marginLeft: 4 },
    footer: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'white', padding: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
    wishlistButton: { justifyContent: 'center', alignItems: 'center', padding: 15, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, marginRight: 10 },
    addToCartButtonFooter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 15, backgroundColor: Colors.SECONDARY, borderRadius: 8, marginRight: 10 },
    addToCartTextFooter: { color: Colors.WHITE, fontWeight: '600', fontSize: 16 },
    checkoutButton: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 15, backgroundColor: Colors.PRIMARY, borderRadius: 8 },
    checkoutText: { color: 'white', fontWeight: '600', fontSize: 16 },
    secureText: { fontSize: 12, color: '#666', marginTop: 4 },
    messageContainer: {
        position: 'absolute',
        bottom: 80,
        left: 0,
        right: 0,
        backgroundColor: '#333',
        padding: 16,
        marginHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    messageText: {
        color: '#fff',
        fontSize: 16,
    },

    videoHeroContainer: {
        width: width,
        height: width,
        backgroundColor: '#000',
        position: 'relative',
        borderWidth: 2,
    },
    youtubeWrapper: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000', // optional black background
    },

    videoHero: {
        position: 'absolute', // Add this
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    videoHeroText: {
        color: Colors.WHITE,
        fontSize: 16,
        marginTop: 10,
        fontWeight: '600',
    },
    mainImage: {
        width: width,
        height: width,
        alignItems: 'center'
    },

    videoBadge: {
        position: 'absolute',
        top: 5,
        right: 5,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderRadius: 8,
        padding: 2,
    },
    videoHeroThumbnail: {
        width: '100%',
        height: '100%',
        position: 'absolute',
    },
    videoThumbnailPlaceholder: {
        width: 80,
        height: 80,
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
    },
    thumbnail: {
        width: 80,
        height: 80,
        borderRadius: 8,
        marginRight: 10,
    },
    // For the play overlay
    videoPlayOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },

    // For the video badge
    videoBadge: {
        position: 'absolute',
        top: 5,
        right: 5,
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: 4,
        borderRadius: 4,
    },

    // For the hero video play button
    videoHero: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
});


export default styles;