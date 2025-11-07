// src/components/Latest/Latest.tsx
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
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { getCategories } from '@/lib/api/categoryApi';
import { getProductDetail, getProducts } from '@/lib/api/productApi';
import { getCustomerById, getSession, updateCustomerById } from '@/lib/services/authService';

/* ------------------------------- Types ------------------------------ */
type Business = {
  id: string; // Parent product ID
  title: string;
  subtitle: string;
  category: string;
  image: any;
  price: number;
  originalPrice?: number;
  discount?: number;
  isVariable?: boolean;
  variationId?: string; // Default first variation ID for cart
  effectiveId: string; // ID to use for cart (variation or parent)
};

type WCImage = { id: number; src: string };
type WCCategory = { id: number; name: string; count: number };
type WCAttribute = { id: number; name: string; slug?: string; options?: string[] };
type WCVariation = {
  id: number;
  price: string;
  regular_price: string;
  sale_price: string;
  attributes: { name: string; option: string }[];
  [k: string]: any;
};
type WCProduct = {
  id: number | string;
  name: string;
  type?: 'simple' | 'variable' | string;
  price: string | number;
  regular_price?: string | number;
  sale_price?: string | number;
  price_html?: string;
  attributes?: WCAttribute[];
  variations?: number[];
  images?: WCImage[];
  categories?: { id: number; name: string }[];
  [k: string]: any;
};

/* ---------------------------- Helpers ------------------------------ */
const toNum = (v: any, fb = 0): number => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fb;
};

const normalizeUri = (u = ''): string => {
  const trimmed = (u || '').trim();
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

// Map WCProduct to Business (handles simple and variable)
const mapToBusiness = async (p: WCProduct): Promise<Business> => {
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

  const imgs = Array.isArray(p?.images) ? p.images : [];
  const firstImg = imgs.length > 0 && typeof imgs[0]?.src === 'string' ? normalizeUri(imgs[0].src) : '';

  return {
    id: String(p?.id ?? ''),
    title: p.name || 'Unnamed',
    subtitle: '',
    category: p.categories?.[0]?.name || 'Unknown',
    image: firstImg ? { uri: firstImg } : imagePath.image11,
    price: sale,
    originalPrice: regular > sale ? regular : undefined,
    discount,
    isVariable,
    variationId,
    effectiveId,
  };
};

/* =================================================================== */
const Latest = () => {
  /* ------------------ Local state ------------------ */
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<number | null>(null);
  const [wishlistIds, setWishlist] = useState<string[]>([]);
  const [cartIds, setCart] = useState<string[]>([]);
  const [toast, setToast] = useState('');

  const [categoryTitle, setCategoryTitle] = useState('Latest Products');

  // NEW: State for tracking loading buttons
  const [loadingWishlist, setLoadingWishlist] = useState<Record<string, boolean>>({});
  const [loadingCart, setLoadingCart] = useState<Record<string, boolean>>({});

  /* ------------------ Meta loader ------------------ */
  const loadUserMeta = useCallback(async () => {
    const session = await getSession();
    if (session?.user?.id) {
      setUserId(session.user.id);
      const customer = await getCustomerById(session.user.id);
      setWishlist(customer?.meta_data?.find((m: any) => m.key === 'wishlist')?.value || []);
      const cartMeta = customer?.meta_data?.find((m: any) => m.key === 'cart')?.value || [];
      setCart(cartMeta.map((c: any) => String(c.id)));
    } else {
      setUserId(null);
      setWishlist([]);
      setCart([]);
    }
  }, []);

  /* ------------------ Category + product loaders ------------------- */
  const loadCategories = useCallback(async () => {
    try {
      const res = await getCategories({ per_page: 10, hide_empty: true, order: 'desc', orderby: 'count' });
      const list = (res?.data || []) as WCCategory[];
      if (!list.length) return null;
      const top = list.reduce((p, c) => (p.count > c.count ? p : c));
      setCategoryTitle(top.name);
      return top.id;
    } catch (e) {
      console.error('Category load error', e);
      return null;
    }
  }, []);

  const loadProducts = useCallback(async (catId: number) => {
    try {
      setLoading(true);
      const res = await getProducts({ per_page: 12, page: 1, status: 'publish', order: 'desc', orderby: 'date', category: String(catId) });
      const list = (res?.data || []) as WCProduct[];

      // Async map for variation handling
      const mappedPromises = list.map(async (p) => await mapToBusiness(p));
      const mapped: Business[] = await Promise.all(mappedPromises);

      setBusinesses(mapped);
    } catch (e) {
      console.error('Product load error', e);
      setBusinesses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ------------------ Initial load ------------------ */
  useEffect(() => {
    (async () => {
      await loadUserMeta();
      const cid = await loadCategories();
      if (cid) await loadProducts(cid);
      else setLoading(false);
    })();
  }, [loadCategories, loadProducts, loadUserMeta]);

  /* -------- Reload meta on screen focus -------- */
  useFocusEffect(
    useCallback(() => {
      loadUserMeta();
    }, [loadUserMeta]),
  );

  /* -------- Cross-screen real-time updates ----- */
  useEffect(() => {
    const wl = DeviceEventEmitter.addListener('wishlistChanged', loadUserMeta);
    const ct = DeviceEventEmitter.addListener('cartChanged', loadUserMeta);
    return () => {
      wl.remove();
      ct.remove();
    };
  }, [loadUserMeta]);

  /* ------------------ Helpers ------------------ */
  const showToast = (txt: string) => {
    setToast(txt);
    setTimeout(() => setToast(''), 1000);
  };

  const emitMeta = (ev: 'wishlistChanged' | 'cartChanged') => DeviceEventEmitter.emit(ev);

  /* ------------------ Mutations ------------------ */
  const toggleWishlist = async (pid: string) => {
    if (!userId) return router.push('/Login/LoginRegisterPage');

    // Set loading state for this specific product (use parent ID for wishlist)
    setLoadingWishlist(prev => ({ ...prev, [pid]: true }));

    try {
      const customer = await getCustomerById(userId);
      let wish = customer?.meta_data?.find((m: any) => m.key === 'wishlist')?.value || [];
      const exists = wish.includes(pid);
      wish = exists ? wish.filter((id: string) => id !== pid) : [...wish, pid];
      await updateCustomerById(userId, { meta_data: [{ key: 'wishlist', value: wish }] });
      setWishlist(wish);
      emitMeta('wishlistChanged');
      showToast(exists ? 'Item removed from wishlist' : 'Item added to wishlist');
    } catch (e) {
      console.error('Wishlist update error', e);
      showToast('Failed to update wishlist');
    } finally {
      // Clear loading state
      setLoadingWishlist(prev => ({ ...prev, [pid]: false }));
    }
  };

  const addToCart = async (effectivePid: string) => { // Use effective ID (variation or parent)
    if (!userId) return router.push('/Login/LoginRegisterPage');

    // Set loading state for this specific product (use effective ID)
    setLoadingCart(prev => ({ ...prev, [effectivePid]: true }));

    try {
      const customer = await getCustomerById(userId);
      let cart = customer?.meta_data?.find((m: any) => m.key === 'cart')?.value || [];
      if (!cart.some((c: any) => c.id === effectivePid)) cart.push({ id: effectivePid, quantity: 1 });
      await updateCustomerById(userId, { meta_data: [{ key: 'cart', value: cart }] });
      setCart(cart.map((c: any) => String(c.id)));
      emitMeta('cartChanged');
      showToast('Item added to cart');
    } catch (e) {
      console.error('Cart update error', e);
      showToast('Failed to add to cart');
    } finally {
      // Clear loading state
      setLoadingCart(prev => ({ ...prev, [effectivePid]: false }));
    }
  };

  /* ------------------ Render card ------------------ */
  const renderCard = ({ item }: { item: Business }) => {
    const inWish = wishlistIds.includes(item.id); // Parent ID for wishlist
    const inCart = cartIds.includes(item.effectiveId); // Effective ID for cart
    const isWishlistLoading = loadingWishlist[item.id];
    const isCartLoading = loadingCart[item.effectiveId];

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: '/pages/DetailsOfItem/ItemDetails', params: { id: item.id } })} // Navigate to parent
      >
        <Image source={item.image} style={styles.image} />

        <View style={styles.textContainer}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>

          <View style={styles.priceContainer}>
            <Text style={styles.price}>₹{item.price.toFixed(2)}</Text>
            {item.originalPrice && item.originalPrice > item.price && (
              <Text style={styles.originalPrice}>₹{item.originalPrice.toFixed(2)}</Text>
            )}
            {item.discount && item.discount > 0 && (
              <View style={styles.discountBadge}>
                <Text style={styles.discountText}>{item.discount}% OFF</Text>
              </View>
            )}
          </View>

          <View style={styles.footerContainer}>
            {/* Wishlist */}
            <TouchableOpacity
              onPress={() => toggleWishlist(item.id)}
              style={styles.iconBtn}
              disabled={isWishlistLoading}
            >
              {isWishlistLoading ? (
                <ActivityIndicator size="small" color={Colors.PRIMARY} />
              ) : (
                <Ionicons
                  name={inWish ? 'heart' : 'heart-outline'}
                  size={20}
                  color={inWish ? Colors.PRIMARY : '#000'}
                />
              )}
            </TouchableOpacity>

            {/* Cart */}
            <TouchableOpacity
              style={[styles.addToCartButton, inCart && { backgroundColor: '#10B981' }]}
              disabled={inCart || isCartLoading}
              onPress={() => addToCart(item.effectiveId)}
            >
              {isCartLoading ? (
                <ActivityIndicator size="small" color={Colors.WHITE} />
              ) : (
                <>
                  <Ionicons name={inCart ? 'checkmark' : 'cart'} size={16} color={Colors.WHITE} />
                  <Text style={styles.cartButtonText}>{inCart ? 'Added' : 'Add'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  /* ------------------ JSX ------------------ */
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{categoryTitle}</Text>
        <TouchableOpacity onPress={() => router.push('/pages/LIstPage/LatestAll')}>
          <Text style={styles.viewAll}>View All</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={{ alignItems: 'center', padding: 20 }}>
          <ActivityIndicator size="large" color={Colors.PRIMARY} />
          <Text style={{ color: '#6B7280', marginTop: 8 }}>Loading latest products...</Text>
        </View>
      ) : businesses.length === 0 ? (
        <View style={{ alignItems: 'center', padding: 40 }}>
          <Ionicons name="search-outline" size={48} color="#ddd" />
          <Text style={{ color: '#6B7280', marginTop: 8 }}>No products found</Text>
        </View>
      ) : (
        <FlatList
          data={businesses}
          keyExtractor={(i) => i.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          renderItem={renderCard}
        />
      )}

      {/* Toast */}
      {toast && (
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>{toast}</Text>
        </View>
      )}
    </View>
  );
};

export default Latest;

/* ------------------------------ Styles ----------------------------- */
const styles = StyleSheet.create({
  container: { marginTop: 20, paddingHorizontal: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: 'bold', color: Colors.SECONDARY },
  viewAll: { fontSize: 14, color: Colors.PRIMARY, fontWeight: '600' },

  card: { backgroundColor: Colors.WHITE, borderRadius: 12, marginRight: 10, marginBottom: 10, width: 160, overflow: 'hidden', elevation: 0.5 },
  image: { width: '100%', height: 120 },
  textContainer: { padding: 12 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#000', marginBottom: 6 },
  priceContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' },
  price: { fontSize: 16, fontWeight: 'bold', color: Colors.PRIMARY },
  originalPrice: { fontSize: 14, color: '#999', textDecorationLine: 'line-through', marginLeft: 8, marginRight: 8 },
  discountBadge: { backgroundColor: '#e53e3e', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8 },
  discountText: { color: 'white', fontWeight: '600', fontSize: 10 },

  footerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: { padding: 4, width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },

  addToCartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.PRIMARY,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 32,
  },
  cartButtonText: { fontSize: 12, color: Colors.WHITE, fontWeight: '600', marginLeft: 4 },

  messageContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0, right: 0,
    backgroundColor: '#333',
    padding: 16,
    marginHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  messageText: { color: '#fff', fontSize: 16 },
});
