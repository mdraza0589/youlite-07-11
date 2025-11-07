// src/pages/AllCategory/CategoryProduct.tsx
import { getCustomerById, getSession, updateCustomerById } from '@/lib/services/authService';
import { loadProductsByCategory, normalizeProduct } from '@/lib/services/productService';
import Colors from '@/utils/Colors';
import Dimenstion from '@/utils/Dimenstion';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { getProductDetail } from '@/lib/api/productApi'; // Added for variation fetching

const { width } = Dimensions.get('window');

/* ---------- TYPES ---------- */
type WCImage = { id: number; src: string; alt?: string };
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
  average_rating?: string | number;
  rating_count?: number;
  images?: WCImage[];
  categories?: { id: number; name: string }[];
  variations?: number[];
  attributes?: WCAttribute[];
  [k: string]: any;
};

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  discount?: string | null;
  image?: string | null;
  rating?: number;
  category: string;
  brand?: string;
  isFeatured?: boolean;
  isTrending?: boolean;
  raw?: WCProduct;
  isVariable?: boolean;
  variationId?: string; // Default first variation ID for cart
  effectiveId: string; // ID for cart (variation or parent)
  variationPrices?: { [key: string]: number };
  variationOriginalPrices?: { [key: string]: number };
  variationDiscounts?: { [key: string]: number };
  variationIds?: { [key: string]: number };
}

type RouteParams = { id?: string; title?: string };

/* ---------- UTILS ---------- */
const safeStr = (v: any, fb = ''): string => (typeof v === 'string' ? v : fb);

const toImg = (src?: string | null, raw?: WCProduct) => {
  const p = safeStr(src);
  if (p) return { uri: p };
  const first = raw?.images?.[0]?.src;
  return first ? { uri: safeStr(first) } : null;
};

const toNum = (v: any, fb = 0): number => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fb;
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

/* ---------- BADGE ---------- */
const CartCount: React.FC<{ count: number }> = ({ count }) => (
  <View style={styles.cartIconContainer}>
    <Ionicons name="cart" size={24} color={Colors.WHITE} />
    {count > 0 && (
      <View style={styles.cartBadge}>
        <Text style={styles.cartBadgeText}>{count}</Text>
      </View>
    )}
  </View>
);

/* ====================================================================== */
const CategoryProduct: React.FC = () => {
  /* ---------- PARAMS ---------- */
  const { id: catId, title: routeTitle } = useLocalSearchParams<RouteParams>();
  const categoryId = catId ? String(catId) : '';
  const title = routeTitle ? String(routeTitle) : 'Products';

  /* ---------- STATE ---------- */
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [cartItems, setCartItems] = useState<{ id: string; quantity: number }[]>([]);
  const [toast, setToast] = useState('');
  const [loadingWishlist, setLoadingWishlist] = useState<Record<string, boolean>>({});
  const [loadingCart, setLoadingCart] = useState<Record<string, boolean>>({});

  /* ---------- HELPERS ---------- */
  const isInCart = (effectivePid: string) => cartItems.some(c => c.id === effectivePid);
  const isInWishlist = (pid: string) => wishlistIds.includes(pid);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1000);
  };

  const syncMeta = async (key: 'cart' | 'wishlist', value: any) => {
    if (!userId) return;
    await updateCustomerById(userId, { meta_data: [{ key, value }] });
  };

  /* ---------- LOAD USER ---------- */
  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session?.user?.id) return;
      setUserId(session.user.id);
      const customer = await getCustomerById(session.user.id);
      setWishlistIds(customer?.meta_data?.find((m: any) => m.key === 'wishlist')?.value || []);
      setCartItems(customer?.meta_data?.find((m: any) => m.key === 'cart')?.value || []);
    })();
  }, []);

  /* ---------- LOAD PRODUCTS ---------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const raw = await loadProductsByCategory(categoryId);

        // Async map for variation handling
        const listPromises = (Array.isArray(raw) ? raw : []).map(async (r, i) => {
          const n = normalizeProduct(r, title);
          let sale = toNum(n?.salePrice ?? n?.price, 0);
          let regular = toNum(n?.regularPrice ?? n?.price, 0);
          let discount: string | null = typeof n?.discount === 'string' ? n.discount : null;
          let isVariable = (r as WCProduct)?.type === 'variable';
          let variationId: string | undefined;
          let effectiveId = String(n?.id ?? i);
          let variationPrices: { [key: string]: number } = {};
          let variationOriginalPrices: { [key: string]: number } = {};
          let variationDiscounts: { [key: string]: number } = {};
          let variationIds: { [key: string]: number } = {};

          if (isVariable) {
            const wcRaw = r as WCProduct;
            const range = parsePriceRangeFromHtml(wcRaw?.price_html);
            if (range.min !== undefined && range.max !== undefined) {
              sale = range.min;
              regular = range.max;
            }

            if (wcRaw.variations && Array.isArray(wcRaw.variations) && wcRaw.variations.length > 0) {
              const variationDetails = await getVariationDetails(String(wcRaw.id), wcRaw.variations);
              variationPrices = variationDetails.variationPrices;
              variationOriginalPrices = variationDetails.variationOriginalPrices;
              variationDiscounts = variationDetails.variationDiscounts;
              variationIds = variationDetails.variationIds;

              // Set min price from variations
              if (Object.keys(variationPrices).length > 0) {
                sale = Math.min(...Object.values(variationPrices));
              }
              // Default to first variation for cart
              const firstOption = Object.keys(variationIds)[0];
              if (firstOption) {
                variationId = String(variationIds[firstOption]);
                effectiveId = variationId;
                // Calculate discount from first variation
                const firstSale = variationPrices[firstOption];
                const firstRegular = variationOriginalPrices[firstOption];
                const pct = pctDiscount(firstRegular, firstSale);
                if (pct) {
                  discount = `${pct}% OFF`;
                }
                regular = firstRegular > sale ? firstRegular : regular;
              }
            }
          } else {
            const pct = pctDiscount(regular, sale);
            if (pct) {
              discount = `${pct}% OFF`;
            }
          }

          return {
            id: String(n?.id ?? i),
            name: safeStr(n?.name, 'Unnamed'),
            price: sale,
            originalPrice: regular > sale ? regular : undefined,
            discount,
            image: n?.image,
            rating: toNum(n?.rating, 0),
            category: safeStr(n?.category, title),
            brand: safeStr(n?.brand, ''),
            isFeatured: !!n?.isFeatured,
            isTrending: !!n?.isTrending,
            raw: n?.raw ?? r,
            isVariable,
            variationId,
            effectiveId,
            variationPrices,
            variationOriginalPrices,
            variationDiscounts,
            variationIds,
          } as Product;
        });

        const list: Product[] = await Promise.all(listPromises);

        if (mounted) setProducts(list);
      } catch {
        if (mounted) {
          setError('Failed to load products.');
          setProducts([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [categoryId, title]);

  /* ---------- ACTIONS ---------- */
  const toggleWishlist = async (pid: string) => {
    if (!userId) return router.push('/Login/LoginRegisterPage');
    setLoadingWishlist(prev => ({ ...prev, [pid]: true }));
    try {
      const updated = isInWishlist(pid)
        ? wishlistIds.filter(id => id !== pid)
        : [...wishlistIds, pid];
      await syncMeta('wishlist', updated);
      setWishlistIds(updated);
      showToast(isInWishlist(pid) ? 'Removed from wishlist' : 'Added to wishlist');
    } catch (e) {
      console.error('Wishlist error:', e);
      showToast('Failed to update wishlist');
    } finally {
      setLoadingWishlist(prev => ({ ...prev, [pid]: false }));
    }
  };

  const addToCart = async (effectivePid: string) => {
    if (!userId) return router.push('/Login/LoginRegisterPage');
    setLoadingCart(prev => ({ ...prev, [effectivePid]: true }));
    try {
      const idx = cartItems.findIndex(c => c.id === effectivePid);
      const updated =
        idx !== -1
          ? cartItems.map((c, i) => (i === idx ? { ...c, quantity: c.quantity + 1 } : c))
          : [...cartItems, { id: effectivePid, quantity: 1 }];
      await syncMeta('cart', updated);
      setCartItems(updated);
      showToast('Item added to cart');
    } catch (e) {
      console.error('Cart error:', e);
      showToast('Failed to add to cart');
    } finally {
      setLoadingCart(prev => ({ ...prev, [effectivePid]: false }));
    }
  };

  /* ---------- FILTERED LISTS ---------- */
  const featured = useMemo(() => products.filter(p => p.isFeatured), [products]);
  const trending = useMemo(() => products.filter(p => p.isTrending), [products]);

  /* ---------- RENDER ITEM ---------- */
  const renderCard = ({ item }: { item: Product }) => {
    const img = toImg(item.image, item.raw);
    const isWishLoading = loadingWishlist[item.id] || false;
    const isCartLoading = loadingCart[item.effectiveId] || false;
    return (
      <TouchableOpacity
        // style={styles.card}
        activeOpacity={0.85}
        onPress={() =>
          router.push({ pathname: '/pages/DetailsOfItem/ItemDetails', params: { id: item.id, title: item.name } })
        }
      >
        {/* IMAGE */}
        <View style={styles.imageBox}>
          {item.discount && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountTxt}>{item.discount}</Text>
            </View>
          )}
          {/* wishlist icon */}
          <TouchableOpacity
            style={styles.wishlistBtn}
            onPress={() => toggleWishlist(item.id)}
            activeOpacity={0.7}
            disabled={isWishLoading}
          >
            {isWishLoading ? (
              <ActivityIndicator size="small" color={Colors.WHITE} />
            ) : (
              <Ionicons
                name={isInWishlist(item.id) ? 'heart' : 'heart-outline'}
                size={18}
                color={isInWishlist(item.id) ? Colors.PRIMARY : '#fff'}
              />
            )}
          </TouchableOpacity>
          {img ? (
            <Image source={img} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.noImg]}>
              <Ionicons name="image" size={32} color={Colors.PRIMARY} />
            </View>
          )}
        </View>
        {/* INFO */}
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              if (star <= (item.rating ?? 0)) {
                return <Ionicons key={star} name="star" size={12} color="#FFD700" />;
              } else if (star - 0.5 <= (item.rating ?? 0)) {
                return <Ionicons key={star} name="star-half" size={12} color="#FFD700" />;
              } else {
                return <Ionicons key={star} name="star-outline" size={12} color="#FFD700" />;
              }
            })}
            <Text style={styles.ratingTxt}>{(item.rating ?? 0).toFixed(1)}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceNow}>₹{item.price.toFixed(2)}</Text>
            {item.originalPrice && item.originalPrice > item.price && (
              <Text style={styles.priceOrig}>₹{item.originalPrice.toFixed(2)}</Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.cartBtn, isInCart(item.effectiveId) && styles.cartBtnAdded]}
            onPress={() => addToCart(item.effectiveId)}
            disabled={isInCart(item.effectiveId) || isCartLoading}
            activeOpacity={0.8}
          >
            {isCartLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name={isInCart(item.effectiveId) ? 'checkmark' : 'cart'} size={14} color="#fff" />
                <Text style={styles.cartTxt}>{isInCart(item.effectiveId) ? 'In Cart' : 'Add'}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item: Product) => item.id;

  /* ---------- UI ---------- */
  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.PRIMARY} />
      </View>
    );
  }

  // Add this check for empty products
  if (products.length === 0 && !error) {
    return (
      <View style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/CartScreen')}>
            <CartCount count={cartItems.length} />
          </TouchableOpacity>
        </View>

        {/* EMPTY STATE */}
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No items available</Text>
          <Text style={styles.emptySubText}>Check back later for new products</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/CartScreen')}>
          <CartCount count={cartItems.length} />
        </TouchableOpacity>
      </View>

      {/* BODY */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {error && <Text style={{ color: 'red', padding: 16 }}>{error}</Text>}

        {featured.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Featured</Text>
            <FlatList
              horizontal
              data={featured}
              renderItem={renderCard}
              keyExtractor={keyExtractor}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

        {trending.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trending</Text>
            <FlatList
              horizontal
              data={trending}
              renderItem={renderCard}
              keyExtractor={keyExtractor}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All Products</Text>
          <View style={styles.grid}>
            {products.map(p => (
              <View key={p.id} style={styles.col}>
                {renderCard({ item: p })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastTxt}>{toast}</Text>
        </View>
      )}
    </View>
  );
};

export default CategoryProduct;

/* ====================================================================== */
const CARD_W = (width - 48) / 2; // 16 padding + 16 gap
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

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
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: Colors.WHITE },
  cartIconContainer: { position: 'relative' },
  cartBadge: {
    position: 'absolute',
    top: -5, right: -5,
    backgroundColor: Colors.WHITE,
    width: 18, height: 18, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center',
  },
  cartBadgeText: { color: Colors.PRIMARY, fontSize: 12, fontWeight: 'bold' },

  /* section */
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: Colors.SECONDARY },

  /* grid */
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  col: { width: CARD_W, marginBottom: 16 },

  /* card */
  // card: { backgroundColor: '#fff', borderRadius: 10},
  imageBox: { position: 'relative' },
  image: { width: '100%', height: 150, resizeMode: 'contain', backgroundColor: '#f8f8f8' },
  noImg: { justifyContent: 'center', alignItems: 'center' },
  discountBadge: {
    position: 'absolute',
    top: 8, left: 8,
    backgroundColor: Colors.PRIMARY,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, zIndex: 3,
  },
  discountTxt: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  wishlistBtn: {
    position: 'absolute',
    top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 4,
    zIndex: 3,
  },
  info: { padding: 10 },
  name: { fontSize: 14, fontWeight: '600', marginBottom: 4, color: '#333' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  ratingTxt: { marginLeft: 4, fontSize: 12, color: '#666' },
  priceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  priceNow: { fontSize: 14, fontWeight: 'bold', color: Colors.PRIMARY },
  priceOrig: { fontSize: 12, color: '#999', textDecorationLine: 'line-through', marginLeft: 8 },
  cartBtn: {
    backgroundColor: Colors.PRIMARY,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6, // Changed from columnGap for RN compatibility
  },
  cartBtnAdded: { backgroundColor: '#28a745' },
  cartTxt: { color: '#fff', fontSize: 12 },

  /* toast */
  toast: {
    position: 'absolute',
    bottom: 20, left: 20, right: 20,
    backgroundColor: '#333',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  toastTxt: { color: '#fff', fontSize: 14 },

  /* empty state */
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
});

