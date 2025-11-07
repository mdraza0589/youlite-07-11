// src/pages/PeopleAlsoViewed/PeopleAlsoViewed.tsx
import imagePath from '@/constant/imagePath';
import Colors from '@/utils/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

// Import APIs
import { getProductDetail, getProducts } from '@/lib/api/productApi';
import { getCustomerById, getSession, updateCustomerById } from '@/lib/services/authService';

const { width } = Dimensions.get('window');

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

interface CartItem {
  id: string;
  quantity: number;
}

interface ProductCardProps {
  imageSource: any;
  title: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  rating: number;
  isInWishlist: boolean;
  isInCart: boolean;
  effectiveId: string;
  onToggleWishlist: (id: string) => void;
  onAddToCart: (effectiveId: string) => void;
  isWishlistLoading?: boolean;
  isCartLoading?: boolean;
}

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

const pickImageSource = (p: WCProduct) => {
  const imgs = Array.isArray(p?.images) ? p.images : [];
  const first = imgs.length > 0 ? imgs[0] : undefined;
  const src = typeof first?.src === 'string' ? normalizeUri(first.src) : '';
  return src.length > 0 ? { uri: src } : imagePath.image11;
};

// Async map WCProduct to card data (handles simple and variable)
const mapToCard = async (p: WCProduct): Promise<ProductCardProps & { id: string; title: string }> => {
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

  const title = typeof p?.name === 'string' && p.name ? p.name : 'Unnamed';

  return {
    id: String(p?.id ?? ''),
    title,
    imageSource: pickImageSource(p),
    price: sale,
    originalPrice: regular > sale ? regular : undefined,
    discount,
    rating: toNum(p?.average_rating ?? 0, 0),
    isInWishlist: false,
    isInCart: false,
    effectiveId,
    onToggleWishlist: () => { },
    onAddToCart: () => { },
    isWishlistLoading: false,
    isCartLoading: false,
  };
};

const ProductCard = ({
  imageSource,
  title,
  price,
  originalPrice,
  discount,
  rating,
  isInWishlist,
  isInCart,
  effectiveId,
  onToggleWishlist,
  onAddToCart,
  isWishlistLoading = false,
  isCartLoading = false,
}: ProductCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.imageContainer}>
        <Image source={imageSource} style={styles.image} />
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={12} color="#FFD700" />
          <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      <View style={styles.priceContainer}>
        <View>
          {originalPrice && originalPrice > price && (
            <Text style={styles.originalPrice}>₹{originalPrice.toFixed(0)}</Text>
          )}
          <Text style={styles.discountedPrice}>₹{price.toFixed(0)}</Text>
        </View>
        {discount && discount > 0 ? (
          <Text style={styles.discount}>{discount}% OFF</Text>
        ) : null}
        <TouchableOpacity
          onPress={() => onToggleWishlist('')} // Parent ID will be passed externally
          style={styles.wishlistButton}
          disabled={isWishlistLoading}
        >
          {isWishlistLoading ? (
            <ActivityIndicator size="small" color={Colors.PRIMARY} />
          ) : (
            <Ionicons
              name={isInWishlist ? "heart" : "heart-outline"}
              size={20}
              color={isInWishlist ? Colors.PRIMARY : "#000"}
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Add to Cart Button with checked functionality */}
      <TouchableOpacity
        style={[styles.addToCartButton, isInCart && { backgroundColor: '#10B981' }]}
        onPress={() => onAddToCart(effectiveId)}
        disabled={isInCart || isCartLoading}
      >
        {isCartLoading ? (
          <ActivityIndicator size="small" color={Colors.WHITE} />
        ) : (
          <>
            <Ionicons
              name={isInCart ? "checkmark" : "cart"}
              size={16}
              color={Colors.WHITE}
            />
            <Text style={styles.addToCartText}>{isInCart ? 'Added' : 'Add to Cart'}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const PeopleAlsoViewed = () => {
  const [items, setItems] = useState<(Omit<ProductCardProps, 'onToggleWishlist' | 'onAddToCart'> & { id: string; title: string })[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [userId, setUserId] = useState<number | null>(null);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [cartIds, setCartIds] = useState<string[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');

  // State for tracking loading buttons
  const [loadingWishlist, setLoadingWishlist] = useState<Record<string, boolean>>({});
  const [loadingCart, setLoadingCart] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getProducts({
        per_page: 12,
        page: 1,
        status: 'publish',
        order: 'desc',
        orderby: 'date',
      });

      const list: WCProduct[] = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? (res as any) : [];

      // Async map for variation handling
      const mappedPromises = list.map(async (p) => await mapToCard(p));
      const mapped = await Promise.all(mappedPromises);

      setItems(mapped);
    } catch (e) {
      console.error('PeopleAlsoViewed: failed to load products', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUserData = useCallback(async () => {
    const session = await getSession();
    if (session?.user?.id) {
      setUserId(session.user.id);
      const customer = await getCustomerById(session.user.id);
      const wl = customer?.meta_data?.find((m: any) => m.key === 'wishlist')?.value || [];
      const cart = customer?.meta_data?.find((m: any) => m.key === 'cart')?.value || [];
      setWishlistIds(wl);
      setCartIds(cart.map((c: CartItem) => String(c.id)));
    } else {
      setUserId(null);
      setWishlistIds([]);
      setCartIds([]);
    }
  }, []);

  useEffect(() => {
    loadUserData();
    load();
  }, [loadUserData, load]);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [loadUserData]),
  );

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(''), 1000);
  };

  const toggleWishlist = async (productId: string) => {
    if (!userId) {
      router.push('/Login/LoginRegisterPage');
      return;
    }

    // Set loading state for this specific product (parent ID)
    setLoadingWishlist(prev => ({ ...prev, [productId]: true }));

    try {
      const customer = await getCustomerById(userId);
      let wishlist = customer?.meta_data?.find((m: any) => m.key === 'wishlist')?.value || [];
      const exists = wishlist.includes(productId);
      wishlist = exists ? wishlist.filter((id: string) => id !== productId) : [...wishlist, productId];
      await updateCustomerById(userId, { meta_data: [{ key: 'wishlist', value: wishlist }] });

      // Reload user data after update
      await loadUserData();

      showFeedback(exists ? 'Item removed from wishlist' : 'Item added to wishlist');
    } catch (error) {
      console.error('Error toggling wishlist:', error);
      showFeedback('Failed to update wishlist');
    } finally {
      // Clear loading state
      setLoadingWishlist(prev => ({ ...prev, [productId]: false }));
    }
  };

  const addToCart = async (effectiveProductId: string) => {
    if (!userId) {
      router.push('/Login/LoginRegisterPage');
      return;
    }

    // Set loading state for this specific product (effective ID)
    setLoadingCart(prev => ({ ...prev, [effectiveProductId]: true }));

    try {
      const customer = await getCustomerById(userId);
      let cart = customer?.meta_data?.find((m: any) => m.key === 'cart')?.value || [];
      const idx = cart.findIndex((c: CartItem) => c.id === effectiveProductId);
      if (idx === -1) {
        cart.push({ id: effectiveProductId, quantity: 1 });
        await updateCustomerById(userId, { meta_data: [{ key: 'cart', value: cart }] });

        // Reload user data after update
        await loadUserData();

        showFeedback('Item added to cart');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      showFeedback('Failed to update cart');
    } finally {
      // Clear loading state
      setLoadingCart(prev => ({ ...prev, [effectiveProductId]: false }));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>People also viewed</Text>

      {loading && items.length === 0 && (
        <View style={{ alignItems: 'center', padding: 20 }}>
          <ActivityIndicator size="large" color={Colors.PRIMARY} />
          <Text style={{ color: '#6B7280', marginTop: 8 }}>Loading products...</Text>
        </View>
      )}

      <View style={styles.grid}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() =>
              router.push({ pathname: '/pages/DetailsOfItem/ItemDetails', params: { id: String(item.id), title: item.title } })
            }
            style={styles.cardContainer}
          >
            <ProductCard
              imageSource={item.imageSource}
              title={item.title}
              price={item.price}
              originalPrice={item.originalPrice}
              discount={item.discount}
              rating={item.rating}
              isInWishlist={wishlistIds.includes(item.id)}
              isInCart={cartIds.includes(item.effectiveId)}
              effectiveId={item.effectiveId}
              onToggleWishlist={() => toggleWishlist(item.id)}
              onAddToCart={addToCart}
              isWishlistLoading={loadingWishlist[item.id]}
              isCartLoading={loadingCart[item.effectiveId]}
            />
          </TouchableOpacity>
        ))}

        {!loading && items.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <Ionicons name="search-outline" size={48} color="#ddd" />
            <Text style={{ color: '#6B7280', marginTop: 8 }}>No products available.</Text>
          </View>
        )}
      </View>

      {feedbackMessage && (
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>{feedbackMessage}</Text>
        </View>
      )}
    </View>
  );
};

export default PeopleAlsoViewed;

const styles = StyleSheet.create({
  container: {
    padding: 10,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',

  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: Colors.SECONDARY,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
  cardContainer: {
    width: (width - 50) / 2,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 1,
    height: 250,
    width: '100%',
  },
  imageContainer: {
    position: 'relative',
    marginBottom: 2,
  },
  image: {
    width: '100%',
    height: 120,
    resizeMode: 'cover',
    borderRadius: 8,
  },
  ratingContainer: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingText: {
    fontSize: 10,
    color: '#fff',
    marginLeft: 2,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 13,
    marginVertical: 4,
    color: '#333',
    fontWeight: '500',
  },
  priceContainer: {
    marginBottom: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  originalPrice: {
    fontSize: 12,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  discountedPrice: {
    fontSize: 16,
    color: Colors.PRIMARY,
    fontWeight: 'bold',
  },
  discount: {
    fontSize: 12,
    color: '#fff',
    fontWeight: 'bold',
    backgroundColor: '#7da112',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  wishlistButton: {
    padding: 4,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addToCartButton: {
    backgroundColor: Colors.PRIMARY,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    width: '100%',
    alignItems: 'center',
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    minHeight: 36,
  },
  addToCartText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  messageContainer: {
    position: 'absolute',
    bottom: 20,
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
});
