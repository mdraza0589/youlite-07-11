// src/components/Featured/Featured.tsx
import imagePath from '@/constant/imagePath';
import Colors from '@/utils/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
  Image,
  ImageSourcePropType,
  ListRenderItem,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { getProductDetail } from '@/lib/api/productApi'; // Added for variation fetching
import { getCustomerById, getSession, updateCustomerById } from '@/lib/services/authService';
import { loadFeaturedProducts, WCProduct } from '@/lib/services/productService';
import { SafeAreaView } from 'react-native-safe-area-context';

/* ------------------------------ Types ------------------------------ */
type GemItem = {
  id: string; // Parent product ID
  title: string;
  image: ImageSourcePropType;
  price: number;
  originalPrice?: number;
  discount?: number;
  rating: number;
  isVariable?: boolean;
  variationId?: string; // Default first variation ID for cart
  effectiveId: string; // ID to use for cart (variation or parent)
};

type WCImage = { id: number; src: string };
type WCAttribute = { id: number; name: string; slug?: string; options?: string[] };
type WCVariation = {
  id: number;
  price: string;
  regular_price: string;
  sale_price: string;
  attributes: { name: string; option: string }[];
  [k: string]: any;
};

declare module '@/lib/services/productService' {
  interface WCProduct {
    type?: 'simple' | 'variable' | string;
    price_html?: string;
    variations?: number[];
    attributes?: WCAttribute[];
    [k: string]: any;
  }
}

/* ----------------------------- Helpers ----------------------------- */
const toNum = (v: any, fb = 0): number => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fb;
};

const normalizeUri = (uri: string): string => {
  const trimmed = (uri || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://')) return trimmed.replace('http://', 'https://');
  return trimmed;
};

const parsePriceRangeFromHtml = (priceHtml?: string): { min?: number; max?: number } => {
  if (!priceHtml || typeof priceHtml !== 'string') return {};

  try {
    const priceMatches = priceHtml.match(/&#8377;([\d,]+\.?\d*)/g) || [];
    const prices: number[] = [];

    priceMatches.forEach(match => {
      const priceStr = match.replace('&#8377;', '').replace(/,/g, '');
      const price = parseFloat(priceStr);
      if (!isNaN(price)) {
        prices.push(price);
      }
    });

    if (prices.length >= 2) {
      return { min: Math.min(...prices), max: Math.max(...prices) };
    } else if (prices.length === 1) {
      return { min: prices[0], max: prices[0] };
    }

    return {};
  } catch (error) {
    console.error('Error parsing price range:', error);
    return {};
  }
};

const pctDiscount = (regular: number, sale: number): number | undefined => {
  if (regular > 0 && sale > 0 && regular > sale) {
    const pct = Math.round(((regular - sale) / regular) * 100);
    return Number.isFinite(pct) && pct > 0 ? pct : undefined;
  }
  return undefined;
};

// Function to get variation details (async, for variable products)
const getVariationDetails = async (productId: string, variationIds: number[]): Promise<{
  variationPrices: { [key: string]: number };
  variationOriginalPrices: { [key: string]: number };
  variationDiscounts: { [key: string]: number };
  variationIds: { [key: string]: number };
}> => {
  const variationPrices: { [key: string]: number } = {};
  const variationOriginalPrices: { [key: string]: number } = {};
  const variationDiscounts: { [key: string]: number } = {};
  const variationIdMap: { [key: string]: number } = {};

  try {
    for (const variationId of variationIds) {
      const variationRes = await getProductDetail(variationId.toString());
      const variationData = variationRes?.data as WCVariation;

      if (variationData) {
        const salePrice = toNum(variationData.sale_price || variationData.price, 0);
        const regularPrice = toNum(variationData.regular_price || variationData.price, 0);
        const discount = pctDiscount(regularPrice, salePrice);

        const attributes = variationData.attributes || [];
        if (attributes.length > 0 && attributes[0].option) {
          const optionKey = attributes[0].option;
          variationPrices[optionKey] = salePrice;
          variationOriginalPrices[optionKey] = regularPrice;
          variationIdMap[optionKey] = variationData.id;
          if (discount) {
            variationDiscounts[optionKey] = discount;
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching variation details:', error);
  }

  return { variationPrices, variationOriginalPrices, variationDiscounts, variationIds: variationIdMap };
};

const pickImageSource = (p: WCProduct): ImageSourcePropType => {
  const first = p?.images?.[0]?.src;
  return first ? { uri: normalizeUri(first) } : imagePath.image11;
};

// Async map WCProduct to GemItem (handles simple and variable)
const mapToGemItem = async (p: WCProduct): Promise<GemItem> => {
  let sale = toNum(p?.sale_price ?? p?.price, 0);
  let regular = toNum(p?.regular_price ?? p?.price, 0);
  let discount: number | undefined;
  let isVariable = p?.type === 'variable';
  let variationId: string | undefined;
  let effectiveId = String(p?.id ?? '');

  if (isVariable) {
    const range = parsePriceRangeFromHtml(p?.price_html);
    if (range.min !== undefined && range.max !== undefined) {
      sale = range.min;
      regular = range.max;
    }

    if (p.variations && Array.isArray(p.variations) && p.variations.length > 0) {
      const variationDetails = await getVariationDetails(String(p.id), p.variations);
      // Set min price from variations
      if (Object.keys(variationDetails.variationPrices).length > 0) {
        sale = Math.min(...Object.values(variationDetails.variationPrices));
      }
      // Default to first variation for cart
      const firstOption = Object.keys(variationDetails.variationIds)[0];
      if (firstOption) {
        variationId = String(variationDetails.variationIds[firstOption]);
        effectiveId = variationId;
        // Calculate discount from first variation
        const firstSale = variationDetails.variationPrices[firstOption];
        const firstRegular = variationDetails.variationOriginalPrices[firstOption];
        discount = pctDiscount(firstRegular, firstSale);
      }
    }
  } else {
    discount = pctDiscount(regular, sale);
  }

  return {
    id: String(p?.id ?? ''),
    title: p.name || 'Unnamed',
    image: pickImageSource(p),
    price: sale,
    originalPrice: regular > sale ? regular : undefined,
    discount,
    rating: toNum(p.average_rating),
    isVariable,
    variationId,
    effectiveId,
  };
};

/* =================================================================== */
const Featured = () => {
  const [items, setItems] = useState<GemItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<number | null>(null);
  const [wishlistIds, setWishlist] = useState<string[]>([]);
  const [cartIds, setCart] = useState<string[]>([]);
  const [toast, setToast] = useState('');

  // NEW: State for tracking loading buttons
  const [loadingWishlist, setLoadingWishlist] = useState<Record<string, boolean>>({});
  const [loadingCart, setLoadingCart] = useState<Record<string, boolean>>({});

  /* -------------------- Loaders -------------------- */
  const loadFeatured = useCallback(async () => {
    try {
      setLoading(true);
      const raw = await loadFeaturedProducts({ perPage: 10, page: 1, order: 'desc', orderby: 'date', status: 'publish' });

      // Async map for variation handling
      const mappedPromises = (Array.isArray(raw) ? raw : []).map(async (p: WCProduct) => await mapToGemItem(p));
      const mappedItems: GemItem[] = await Promise.all(mappedPromises);

      setItems(mappedItems);
    } catch (err) {
      console.error('Failed loading featured:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUserMeta = useCallback(async () => {
    const session = await getSession();
    if (!session?.user?.id) {
      setUserId(null);
      setWishlist([]);
      setCart([]);
      return;
    }
    setUserId(session.user.id);

    const customer = await getCustomerById(session.user.id);
    setWishlist(customer?.meta_data?.find((m: any) => m.key === 'wishlist')?.value || []);
    const cartMeta: any[] = customer?.meta_data?.find((m: any) => m.key === 'cart')?.value || [];
    setCart(cartMeta.map((c) => String(c.id)));
  }, []);

  /* -------------------- Init -------------------- */
  useEffect(() => {
    loadFeatured();
    loadUserMeta();
  }, [loadFeatured, loadUserMeta]);

  /* Refresh meta on focus */
  useFocusEffect(
    useCallback(() => {
      loadUserMeta();
    }, [loadUserMeta]),
  );

  /* Listen for external meta changes */
  useEffect(() => {
    const wl = DeviceEventEmitter.addListener('wishlistChanged', loadUserMeta);
    const ct = DeviceEventEmitter.addListener('cartChanged', loadUserMeta);
    return () => {
      wl.remove();
      ct.remove();
    };
  }, [loadUserMeta]);

  /* -------------------- Utils -------------------- */
  const emitMeta = (ev: 'wishlistChanged' | 'cartChanged') => DeviceEventEmitter.emit(ev);

  const showTempMessage = (text: string) => {
    setToast(text);
    setTimeout(() => setToast(''), 1000);
  };

  /* -------------------- Mutations -------------------- */
  const toggleWishlist = async (productId: string) => {
    if (!userId) return router.push('/Login/MobileRegistrationScreen');

    // Set loading state for this specific product (use parent ID for wishlist)
    setLoadingWishlist(prev => ({ ...prev, [productId]: true }));

    try {
      const customer = await getCustomerById(userId);
      let wish: string[] = customer?.meta_data?.find((m: any) => m.key === 'wishlist')?.value || [];

      const exists = wish.includes(productId);
      wish = exists ? wish.filter(id => id !== productId) : [...wish, productId];

      await updateCustomerById(userId, { meta_data: [{ key: 'wishlist', value: wish }] });
      setWishlist(wish);
      emitMeta('wishlistChanged');
      showTempMessage(exists ? 'Item removed from wishlist' : 'Item added to wishlist');
    } catch (err) {
      console.error('Wishlist error:', err);
      showTempMessage('Failed to update wishlist');
    } finally {
      // Clear loading state
      setLoadingWishlist(prev => ({ ...prev, [productId]: false }));
    }
  };

  const addToCart = async (effectiveProductId: string) => { // Use effective ID (variation or parent)
    if (!userId) return router.push('/Login/MobileRegistrationScreen');

    // Set loading state for this specific product (use effective ID)
    setLoadingCart(prev => ({ ...prev, [effectiveProductId]: true }));

    try {
      const customer = await getCustomerById(userId);
      let cart = customer?.meta_data?.find((m: any) => m.key === 'cart')?.value || [];

      if (!cart.some((c: any) => c.id === effectiveProductId)) cart.push({ id: effectiveProductId, quantity: 1 });

      await updateCustomerById(userId, { meta_data: [{ key: 'cart', value: cart }] });
      setCart(cart.map((c: any) => String(c.id)));
      emitMeta('cartChanged');
      showTempMessage('Item added to cart');
    } catch (err) {
      console.error('Cart error:', err);
      showTempMessage('Failed to add to cart');
    } finally {
      // Clear loading state
      setLoadingCart(prev => ({ ...prev, [effectiveProductId]: false }));
    }
  };

  /* -------------------- Render -------------------- */
  const renderCard: ListRenderItem<GemItem> = ({ item }) => {
    const inWishlist = wishlistIds.includes(item.id); // Parent ID for wishlist
    const inCart = cartIds.includes(item.effectiveId); // Effective ID for cart
    const isWishlistLoading = loadingWishlist[item.id] || false;
    const isCartLoading = loadingCart[item.effectiveId] || false;

    return (
      <View style={styles.card}>
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/pages/DetailsOfItem/ItemDetails', params: { id: item.id, title: item.title } })}
          activeOpacity={0.85}
        >
          {/* Rating */}
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={12} color="#FFD700" />
            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
          </View>

          {/* Title */}
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>

          {/* Image */}
          <View style={styles.imageContainer}>
            <Image source={item.image} style={styles.productImage} />
          </View>

          {/* Price + Wishlist */}
          <View style={styles.priceContainer}>
            <View>
              <Text style={styles.priceText}>₹{item.price.toFixed(0)}</Text>
              {item.originalPrice && item.originalPrice > item.price && (
                <Text style={styles.originalPriceText}>₹{item.originalPrice.toFixed(0)}</Text>
              )}
            </View>
            {item.discount && item.discount > 0 && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>{item.discount}% OFF</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.wishlistIcon}
              onPress={() => toggleWishlist(item.id)}
              disabled={isWishlistLoading}
            >
              {isWishlistLoading ? (
                <ActivityIndicator size="small" color={Colors.PRIMARY} />
              ) : (
                <Ionicons
                  name={inWishlist ? 'heart' : 'heart-outline'}
                  size={20}
                  color={inWishlist ? Colors.PRIMARY : '#000'}
                />
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* Add / Added */}
        <TouchableOpacity
          style={[styles.addToCartButton, inCart && { backgroundColor: '#10B981' }]}
          disabled={inCart || isCartLoading}
          onPress={() => addToCart(item.effectiveId)}
        >
          {isCartLoading ? (
            <ActivityIndicator size="small" color={Colors.WHITE} />
          ) : (
            <>
              <Ionicons name={inCart ? 'checkmark' : 'cart-outline'} size={16} color={Colors.WHITE} />
              <Text style={styles.addToCartText}>{inCart ? 'Added' : 'Add to Cart'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  /* -------------------- JSX -------------------- */
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Featured Products</Text>
        <Text style={styles.subtitle}>Discover Amazing Deals</Text>
      </View>

      {loading ? (
        <View style={{ alignItems: 'center', padding: 20 }}>
          <ActivityIndicator size="large" color={Colors.PRIMARY} />
          <Text style={{ color: '#6B7280', marginTop: 8 }}>Loading featured products...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 40 }}>
          <Ionicons name="star-outline" size={48} color="#ddd" />
          <Text style={{ color: '#6B7280', marginTop: 8 }}>No featured products</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderCard}
          keyExtractor={(it) => it.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContentContainer}
          ListEmptyComponent={
            <Text style={{ paddingHorizontal: 16, color: '#6B7280' }}>
              No featured products.
            </Text>
          }
        />
      )}

      {toast && (
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>{toast}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

export default Featured;

/* ----------------------------- Styles ----------------------------- */
const styles = StyleSheet.create({
  container: { backgroundColor: '#F9FAFB', marginBottom: 10 },
  header: { paddingHorizontal: 10, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: Colors.SECONDARY },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 4 },

  listContentContainer: { paddingLeft: 0, paddingRight: 0 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 10, marginHorizontal: 4, width: 160 },
  ratingBadge: {
    position: 'absolute',
    top: 30,
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 12,
    zIndex: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  ratingText: { color: '#fff', fontSize: 10, fontWeight: 'bold', marginLeft: 2 },
  cardTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#1F2937' },

  imageContainer: { width: '100%', height: 120, borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  productImage: { width: '100%', height: '100%', resizeMode: 'cover' },

  priceContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  priceText: { fontSize: 16, fontWeight: 'bold', color: Colors.PRIMARY },
  originalPriceText: { fontSize: 12, color: '#9CA3AF', textDecorationLine: 'line-through', marginTop: 2 },

  discountBadge: { backgroundColor: Colors.PRIMARY, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, marginLeft: 8 },
  discountText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  wishlistIcon: { padding: 4, width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },

  addToCartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.PRIMARY,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    minHeight: 36,
  },
  addToCartText: { color: Colors.WHITE, fontWeight: '600', fontSize: 12 },

  messageContainer: { position: 'absolute', bottom: 20, left: 0, right: 0, backgroundColor: '#333', padding: 16, marginHorizontal: 16, borderRadius: 8, alignItems: 'center' },
  messageText: { color: '#fff', fontSize: 16 },
});
