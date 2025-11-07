import { getCategories } from '@/lib/api/categoryApi';
import { getProductDetail, getProducts } from '@/lib/api/productApi';
import { getCustomerById, getSession, updateCustomerById } from '@/lib/services/authService';
import Colors from '@/utils/Colors';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Dimensions,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');
const side = 16;
const gap = 16;
const cardWidth = (width - side * 2 - gap) / 2;

// ---------- Types ----------
type RawCategory = { id: number; name: string; parent?: number; image?: { src: string } };
type RawTag = { id: number; name: string };
type RawAttribute = {
  id: number;
  name: string;
  slug: string;
  position: number;
  visible: boolean;
  variation: boolean;
  options: string[];
};
type WCVariation = {
  id: number;
  price: string;
  regular_price: string;
  sale_price: string;
  attributes: { name: string; option: string }[];
  [k: string]: any;
};

interface Product {
  id: string;
  name: string;
  type?: 'simple' | 'variable' | string;
  price_html?: string;
  price: number;
  originalPrice?: number;
  discount?: string;
  image: { uri: string } | { uri?: string } | any;
  rating: number;
  category: string;
  brand: string;
  featured: boolean;
  categoriesRaw?: RawCategory[];
  tagsRaw?: RawTag[];
  attributesRaw?: RawAttribute[];
  default_attributes?: any[];
  variations?: (number | string)[];
  on_sale?: boolean;
  stock_status?: 'instock' | 'outofstock' | 'onbackorder';
  // Enhanced for variations
  variationPrices?: { [key: string]: number };
  variationOriginalPrices?: { [key: string]: number };
  variationDiscounts?: { [key: string]: number };
  variationIds?: { [key: string]: number };
  effectiveId?: string; // Variation ID for cart, parent for simple
}

interface Category {
  id: number;
  name: string;
  parent: number;
  image?: { src: string };
}
type CategoryChipType = { id: 'all' | number; name: string; image?: { src: string } };

type Filters = {
  priceMin: number | null;
  priceMax: number | null;
  categoryIds: number[];
  featured: boolean | null;
  tagIds: number[];
  minRating: number | null;
  brands: string[];
  attributes: Record<string, string[]>;
  inStockOnly: boolean;
  onSaleOnly: boolean;
};

const defaultFilters: Filters = {
  priceMin: null,
  priceMax: null,
  categoryIds: [],
  featured: null,
  tagIds: [],
  minRating: null,
  brands: [],
  attributes: {},
  inStockOnly: false,
  onSaleOnly: false,
};

// ---------- Helpers ----------
const toNum = (v: any, fb = 0): number => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fb;
};
const safeFirstImage = (imgs?: any[]): { uri: string } => {
  const src = imgs?.[0]?.src ? String(imgs[0].src) : 'https://via.placeholder.com/400x400/E5E7EB/6B7280?text=No+Image';
  return { uri: src };
};
const mapProduct = (p: any): Product => {
  const sale = toNum(p.sale_price ?? p.price, 0);
  const regular = toNum(p.regular_price ?? p.price, 0);
  const discount = regular > sale ? `${Math.round(((regular - sale) / regular) * 100)}% OFF` : undefined;
  const brand = p.categories?.find((c: any) => c.parent === 0)?.name || 'Generic';
  return {
    id: String(p.id),
    type: p.type,
    price_html: p.price_html,
    name: String(p.name ?? ''),
    price: sale,
    originalPrice: regular !== sale ? regular : undefined,
    discount,
    image: safeFirstImage(p.images),
    rating: toNum(p.average_rating, 4),
    category: p.categories?.[0]?.name || 'Uncategorized',
    brand,
    featured: !!p.featured,
    categoriesRaw: (p.categories || []) as RawCategory[],
    tagsRaw: (p.tags || []) as RawTag[],
    attributesRaw: (p.attributes || []) as RawAttribute[],
    default_attributes: Array.isArray(p.default_attributes) ? p.default_attributes : [],
    variations: Array.isArray(p.variations) ? p.variations : [],
    on_sale: !!p.on_sale,
    stock_status: p.stock_status || 'instock',
  };
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

// Process product for variations (async)
const processProductVariations = async (p: Product): Promise<Product> => {
  const isVariable = p?.type === 'variable';
  let sale = p.price;
  let regular = p.originalPrice ?? sale;
  let discount: string | undefined = p.discount;

  if (isVariable) {
    // Try HTML range first
    const range = parsePriceRangeFromHtml(p?.price_html);
    if (range.min !== undefined && range.max !== undefined) {
      sale = range.min;
      regular = range.max;
    }

    // Fetch variations if available
    if (p.variations && Array.isArray(p.variations) && p.variations.length > 0) {
      const variationDetails = await getVariationDetails(p.id, p.variations as number[]);
      p.variationPrices = variationDetails.variationPrices;
      p.variationOriginalPrices = variationDetails.variationOriginalPrices;
      p.variationDiscounts = variationDetails.variationDiscounts;
      p.variationIds = variationDetails.variationIds;

      // Set min price from variations
      if (Object.keys(variationDetails.variationPrices).length > 0) {
        sale = Math.min(...Object.values(variationDetails.variationPrices));
      }
      // Default to first variation for cart
      const firstOption = Object.keys(variationDetails.variationIds)[0];
      if (firstOption) {
        p.effectiveId = String(variationDetails.variationIds[firstOption]);
        // Calculate discount from first variation
        const firstSale = variationDetails.variationPrices[firstOption];
        const firstRegular = variationDetails.variationOriginalPrices[firstOption];
        const pct = pctDiscount(firstRegular, firstSale);
        if (pct) {
          discount = `${pct}% OFF`;
        }
        // Use max regular for display, min sale
        const regs = Object.values(variationDetails.variationOriginalPrices);
        regular = regs.length > 0 ? Math.max(...regs) : firstRegular;
      }
    }
  } else {
    // Simple product
    p.effectiveId = p.id;
  }

  // Set computed fields
  p.price = sale;
  p.originalPrice = regular > sale ? regular : p.originalPrice;
  p.discount = discount || p.discount;

  return p;
};

// ---------- Component ----------
const AllProductsScreen: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryChipType>({
    id: 'all',
    name: 'All',
    image: { src: 'https://cdn-icons-png.flaticon.com/512/3233/3233481.png' },
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [baseProducts, setBaseProducts] = useState<Product[]>([]);

  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [cartIds, setCartIds] = useState<string[]>([]);
  const [userId, setUserId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [categoryTitle, setCategoryTitle] = useState('All Products');

  const [loadingWishlist, setLoadingWishlist] = useState<Record<string, boolean>>({});
  const [loadingCart, setLoadingCart] = useState<Record<string, boolean>>({});

  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [filterOpen, setFilterOpen] = useState<boolean>(false);
  const [sort, setSort] = useState<'recent' | 'low' | 'high' | 'rating'>('recent');

  // Derived metadata for filter UI
  const [allTags, setAllTags] = useState<RawTag[]>([]);
  const [allBrands, setAllBrands] = useState<string[]>([]);
  const [allAttributes, setAllAttributes] = useState<Record<string, string[]>>({});

  const emitMeta = (ev: 'wishlistChanged' | 'cartChanged') => DeviceEventEmitter.emit(ev);

  // ---------- Data Load ----------
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const qp: any = { per_page: 50, page: 1, status: 'publish', order: 'desc', orderby: 'date' };
      if (selectedCategory.id !== 'all') {
        qp.category = selectedCategory.id;
        setCategoryTitle(selectedCategory.name);
      } else {
        setCategoryTitle('All Products');
      }
      const resp = await getProducts(qp);
      let mapped: Product[] = (resp?.data || []).map(mapProduct);

      // Async process for variations
      const processedPromises = mapped.map(async (p) => await processProductVariations(p));
      const processedMapped = await Promise.all(processedPromises);

      // derive tags/brands/attributes
      const tMap = new Map<number, RawTag>();
      const bSet = new Set<string>();
      const attrMap: Record<string, Set<string>> = {};
      processedMapped.forEach((p) => {
        (p.tagsRaw || []).forEach((t) => tMap.set(t.id, t));
        const root = (p.categoriesRaw || []).find((c) => !c.parent || c.parent === 0);
        if (root?.name) bSet.add(root.name);
        (p.attributesRaw || []).forEach((a) => {
          const key = a.name || a.slug || `attr_${a.id}`;
          if (!attrMap[key]) attrMap[key] = new Set<string>();
          (a.options || []).forEach((opt) => attrMap[key].add(String(opt)));
        });
      });
      const attrObj = Object.fromEntries(
        Object.entries(attrMap).map(([k, v]) => [k, Array.from(v.values()).sort()])
      );

      setBaseProducts(processedMapped);
      setProducts(processedMapped);
      setAllTags(Array.from(tMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
      setAllBrands(Array.from(bSet.values()).sort());
      setAllAttributes(attrObj);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  const loadCategoriesData = useCallback(async () => {
    try {
      const cats = await getCategories({
        per_page: 50,
        hide_empty: true,
        orderby: 'count',
        order: 'desc',
      });
      const categoriesWithImages = (Array.isArray(cats?.data) ? cats.data : []).map((cat: any) => ({
        ...cat,
        image: cat.image,
      })) as Category[];
      setCategories(categoriesWithImages);
    } catch (e) {
      // silent
    }
  }, []);

  const loadUser = useCallback(async () => {
    try {
      const session = await getSession();
      if (!session?.user?.id) {
        setUserId(null);
        setWishlistIds([]);
        setCartIds([]);
        return;
      }
      setUserId(session.user.id);
      const customer = await getCustomerById(session.user.id);
      const wishlist: string[] = customer?.meta_data?.find((m: any) => m.key === 'wishlist')?.value || [];
      const cartMeta: any[] = customer?.meta_data?.find((m: any) => m.key === 'cart')?.value || [];
      setWishlistIds(Array.isArray(wishlist) ? wishlist : []);
      setCartIds(Array.isArray(cartMeta) ? cartMeta.map((c) => String(c.id)) : []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadUser();
    loadCategoriesData();
  }, [loadUser, loadCategoriesData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const wl = DeviceEventEmitter.addListener('wishlistChanged', loadUser);
    const ct = DeviceEventEmitter.addListener('cartChanged', loadUser);
    return () => {
      wl.remove();
      ct.remove();
    };
  }, [loadUser]);

  // ---------- Filters + Sort ----------
  const filteredProducts = useMemo(() => {
    let arr = [...baseProducts];

    // price
    if (filters.priceMin !== null) arr = arr.filter((p) => p.price >= (filters.priceMin as number));
    if (filters.priceMax !== null) arr = arr.filter((p) => p.price <= (filters.priceMax as number));

    // categories
    if (filters.categoryIds.length) {
      const ids = new Set(filters.categoryIds);
      arr = arr.filter((p) => (p.categoriesRaw || []).some((c) => ids.has(c.id)));
    }

    // featured
    if (filters.featured !== null) {
      arr = arr.filter((p) => !!p.featured === !!filters.featured);
    }

    // tags
    if (filters.tagIds.length) {
      const ids = new Set(filters.tagIds);
      arr = arr.filter((p) => (p.tagsRaw || []).some((t) => ids.has(t.id)));
    }

    // rating
    if (filters.minRating !== null) {
      arr = arr.filter((p) => p.rating >= (filters.minRating as number));
    }

    // brands
    if (filters.brands.length) {
      const brands = new Set(filters.brands.map((b) => b.toLowerCase()));
      arr = arr.filter((p) => {
        const root = (p.categoriesRaw || []).find((c) => !c.parent || c.parent === 0);
        return root?.name ? brands.has(root.name.toLowerCase()) : false;
      });
    }

    // attributes
    const attrKeys = Object.keys(filters.attributes).filter((k) => (filters.attributes[k] || []).length);
    if (attrKeys.length) {
      arr = arr.filter((p) => {
        const pAttrs = p.attributesRaw || [];
        return attrKeys.every((k) => {
          const selected = new Set(filters.attributes[k]);
          const match = pAttrs.find((a) => a.name === k || a.slug === k);
          if (!match) return false;
          return (match.options || []).some((opt) => selected.has(String(opt)));
        });
      });
    }

    // stock / sale
    if (filters.inStockOnly) arr = arr.filter((p) => (p.stock_status || 'instock') === 'instock');
    if (filters.onSaleOnly) {
      arr = arr.filter((p) => {
        const reg = p.originalPrice ?? p.price;
        return p.price < reg || !!p.on_sale;
      });
    }

    // sort
    if (sort === 'low') arr.sort((a, b) => a.price - b.price);
    if (sort === 'high') arr.sort((a, b) => b.price - a.price);
    if (sort === 'rating') arr.sort((a, b) => b.rating - a.rating);
    // recent keeps API order

    return arr;
  }, [baseProducts, filters, sort]);

  useEffect(() => {
    setProducts(filteredProducts);
  }, [filteredProducts]);

  // ---------- Wishlist ----------
  const toggleWishlist = async (productId: string) => {
    if (!userId) {
      router.push('/Login/LoginRegisterPage');
      return;
    }
    setLoadingWishlist((prev) => ({ ...prev, [productId]: true }));
    try {
      const customer = await getCustomerById(userId);
      let wish: string[] = customer?.meta_data?.find((m: any) => m.key === 'wishlist')?.value || [];
      const exists = wish.includes(productId);
      wish = exists ? wish.filter((id) => id !== productId) : [...wish, productId];
      await updateCustomerById(userId, { meta_data: [{ key: 'wishlist', value: wish }] });
      setWishlistIds(wish);
      emitMeta('wishlistChanged');
    } catch (error) {
      Alert.alert('Error', 'Failed to update wishlist');
    } finally {
      setLoadingWishlist((prev) => ({ ...prev, [productId]: false }));
    }
  };

  // ---------- Cart ----------
  const handleAddToCart = async (effectiveId: string) => {
    if (!userId) {
      router.push('/Login/LoginRegisterPage');
      return;
    }
    setLoadingCart((prev) => ({ ...prev, [effectiveId]: true }));
    try {
      const customer = await getCustomerById(userId);
      let cart = customer?.meta_data?.find((m: any) => m.key === 'cart')?.value || [];
      if (!Array.isArray(cart)) cart = [];
      if (!cart.some((c: any) => String(c.id) === effectiveId)) {
        cart.push({ id: effectiveId, quantity: 1 });
      }
      await updateCustomerById(userId, { meta_data: [{ key: 'cart', value: cart }] });
      setCartIds(cart.map((c: any) => String(c.id)));
      emitMeta('cartChanged');
      Alert.alert('Success', 'Item added to cart!');
    } catch (error) {
      Alert.alert('Error', 'Failed to add to cart');
    } finally {
      setLoadingCart((prev) => ({ ...prev, [effectiveId]: false }));
    }
  };
  const isInCart = (effectiveId: string) => cartIds.includes(effectiveId);

  // ---------- UI: Product Card ----------
  const ProductCard: React.FC<{ item: Product }> = ({ item }) => {
    const productId = item.id;
    const effectiveId = item.effectiveId || productId;
    const isWishlistLoading = !!loadingWishlist[productId];
    const isCartLoading = !!loadingCart[effectiveId];
    const inWishlist = wishlistIds.includes(productId);
    const inCart = isInCart(effectiveId);
    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() =>
            router.push({ pathname: '/pages/DetailsOfItem/ItemDetails', params: { id: productId, title: item.name } })
          }
          activeOpacity={0.9}
        >
          <Image source={item.image} style={styles.cardImage} resizeMode="cover" />
          {!!item.discount && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>{item.discount}</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.wishlistBtn}
            onPress={() => toggleWishlist(productId)}
            disabled={isWishlistLoading}
            activeOpacity={0.85}
          >
            {isWishlistLoading ? (
              <ActivityIndicator size="small" color={Colors.PRIMARY} />
            ) : (
              <Ionicons
                name={inWishlist ? 'heart' : 'heart-outline'}
                size={18}
                color={inWishlist ? Colors.PRIMARY : '#333'}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>

        <LinearGradient colors={['#ffffff', '#f9f9f9']} style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={styles.priceBox}>
            <Text style={styles.priceNow}>₹{item.price.toFixed(0)}</Text>
            {item.originalPrice !== undefined && (
              <Text style={styles.priceOld}>₹{item.originalPrice.toFixed(0)}</Text>
            )}
          </View>
          <LinearGradient
            colors={inCart ? ['#51cf66', '#2b8a3e'] : [Colors.PRIMARY, Colors.PRIMARY]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cartBtn}
          >
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              onPress={() => handleAddToCart(effectiveId)}
              disabled={inCart || isCartLoading}
              activeOpacity={0.9}
            >
              {isCartLoading ? (
                <ActivityIndicator size="small" color={Colors.WHITE} />
              ) : (
                <>
                  <Ionicons name={inCart ? 'checkmark-circle' : 'cart-outline'} size={14} color="#fff" />
                  <Text style={styles.cartTxt}>{inCart ? 'Added' : 'Add to Cart'}</Text>
                </>
              )}
            </TouchableOpacity>
          </LinearGradient>
        </LinearGradient>
      </View>
    );
  };

  // ---------- UI: Category Chip ----------
  const renderCategoryChip = ({ item }: { item: CategoryChipType }) => {
    const isSelected = selectedCategory.id === item.id;
    return (
      <TouchableOpacity
        style={[styles.catCard, isSelected && styles.catCardActive]}
        onPress={() => setSelectedCategory(item)}
        activeOpacity={0.85}
      >
        <Image source={{ uri: item.image?.src || 'https://via.placeholder.com/100' }} style={styles.catImg} />
        <Text style={[styles.catText, isSelected && styles.catActiveText]} numberOfLines={1}>
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  // ---------- UI: Filters Modal ----------
  const FilterModal: React.FC = () => {
    const [local, setLocal] = useState<Filters>(filters);

    useEffect(() => {
      setLocal(filters);
    }, [filters]);

    const toggleCategory = (id: number) => {
      setLocal((p) => {
        const exists = p.categoryIds.includes(id);
        return { ...p, categoryIds: exists ? p.categoryIds.filter((x) => x !== id) : [...p.categoryIds, id] };
      });
    };
    const toggleTag = (id: number) => {
      setLocal((p) => {
        const exists = p.tagIds.includes(id);
        return { ...p, tagIds: exists ? p.tagIds.filter((x) => x !== id) : [...p.tagIds, id] };
      });
    };
    const toggleBrand = (name: string) => {
      setLocal((p) => {
        const exists = p.brands.includes(name);
        return { ...p, brands: exists ? p.brands.filter((x) => x !== name) : [...p.brands, name] };
      });
    };
    const toggleAttr = (key: string, opt: string) => {
      setLocal((p) => {
        const arr = p.attributes[key] || [];
        const exists = arr.includes(opt);
        const next = exists ? arr.filter((x) => x !== opt) : [...arr, opt];
        return { ...p, attributes: { ...p.attributes, [key]: next } };
      });
    };
    const clearAll = () => setLocal(defaultFilters);
    const apply = () => {
      setFilters(local);
      setFilterOpen(false);
    };

    return (
      <Modal visible={filterOpen} animationType="slide" transparent>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setFilterOpen(false)} activeOpacity={0.85}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
              {/* Price */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Price</Text>
                <View style={styles.priceRow}>
                  <TouchableOpacity
                    onPress={() => setLocal((p) => ({ ...p, priceMin: null, priceMax: null }))}
                    style={[styles.chip, local.priceMin === null && local.priceMax === null && styles.chipActive]}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        local.priceMin === null && local.priceMax === null && styles.chipTextActive,
                      ]}
                    >
                      Any
                    </Text>
                  </TouchableOpacity>
                  {[{ min: 0, max: 499 }, { min: 500, max: 1999 }, { min: 2000, max: 4999 }, { min: 5000, max: null }].map(
                    (r) => {
                      const active = local.priceMin === r.min && (local.priceMax ?? null) === (r.max ?? null);
                      return (
                        <TouchableOpacity
                          key={`${r.min}-${r.max ?? 'max'}`}
                          onPress={() => setLocal((p) => ({ ...p, priceMin: r.min, priceMax: r.max }))}
                          style={[styles.chip, active && styles.chipActive]}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {r.max === null ? `₹${r.min}+` : `₹${r.min}-₹${r.max}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                  )}
                </View>
              </View>

              {/* Categories */}
              {!!categories.length && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Categories</Text>
                  <View style={styles.chipWrap}>
                    {categories.map((c) => {
                      const active = local.categoryIds.includes(c.id);
                      return (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => toggleCategory(c.id)}
                          style={[styles.chip, active && styles.chipActive]}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Highlights */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Highlights</Text>
                <View style={styles.rowBetween}>
                  <Text style={styles.switchLabel}>Featured only</Text>
                  <Switch
                    value={!!local.featured}
                    onValueChange={(v) => setLocal((p) => ({ ...p, featured: v ? true : null }))}
                    thumbColor={local.featured ? Colors.PRIMARY : '#fff'}
                    trackColor={{ true: '#E0E7FF', false: '#E5E7EB' }}
                  />
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.switchLabel}>In stock only</Text>
                  <Switch
                    value={local.inStockOnly}
                    onValueChange={(v) => setLocal((p) => ({ ...p, inStockOnly: v }))}
                    thumbColor={local.inStockOnly ? Colors.PRIMARY : '#fff'}
                    trackColor={{ true: '#E0E7FF', false: '#E5E7EB' }}
                  />
                </View>
                <View style={styles.rowBetween}>
                  <Text style={styles.switchLabel}>On sale only</Text>
                  <Switch
                    value={local.onSaleOnly}
                    onValueChange={(v) => setLocal((p) => ({ ...p, onSaleOnly: v }))}
                    thumbColor={local.onSaleOnly ? Colors.PRIMARY : '#fff'}
                    trackColor={{ true: '#E0E7FF', false: '#E5E7EB' }}
                  />
                </View>
              </View>

              {/* Tags */}
              {!!allTags.length && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Tags</Text>
                  <View style={styles.chipWrap}>
                    {allTags.map((t) => {
                      const active = local.tagIds.includes(t.id);
                      return (
                        <TouchableOpacity
                          key={t.id}
                          onPress={() => toggleTag(t.id)}
                          style={[styles.chip, active && styles.chipActive]}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Rating */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Minimum Rating</Text>
                <View style={styles.ratingFilterRow}>
                  {[0, 3, 4, 4.5].map((r) => {
                    const active = (local.minRating || 0) === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setLocal((p) => ({ ...p, minRating: r === 0 ? null : r }))}
                        style={[styles.ratingPill, active && styles.ratingPillActive]}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="star" size={12} color={active ? Colors.WHITE : '#F59E0B'} />
                        <Text style={[styles.ratingPillText, active && { color: Colors.WHITE }]}>
                          {r === 0 ? 'Any' : `${r}+`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Brands */}
              {!!allBrands.length && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Brands</Text>
                  <View style={styles.chipWrap}>
                    {allBrands.map((b) => {
                      const active = local.brands.includes(b);
                      return (
                        <TouchableOpacity
                          key={b}
                          onPress={() => toggleBrand(b)}
                          style={[styles.chip, active && styles.chipActive]}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{b}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Attributes (e.g., Light: Warm White, RGB Light) */}
              {Object.keys(allAttributes).length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Attributes</Text>
                  {Object.entries(allAttributes).map(([key, opts]) => {
                    const selected = new Set(local.attributes[key] || []);
                    return (
                      <View key={key} style={{ marginBottom: 8 }}>
                        <Text style={styles.attrTitle}>{key}</Text>
                        <View style={styles.chipWrap}>
                          {opts.map((opt) => {
                            const active = selected.has(opt);
                            return (
                              <TouchableOpacity
                                key={`${key}_${opt}`}
                                onPress={() => toggleAttr(key, opt)}
                                style={[styles.chip, active && styles.chipActive]}
                                activeOpacity={0.85}
                              >
                                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity onPress={clearAll} style={[styles.footerBtn, styles.footerGhost]} activeOpacity={0.9}>
                <Text style={[styles.footerBtnText, { color: Colors.PRIMARY }]}>Clear All</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={apply} style={[styles.footerBtn, styles.footerSolid]} activeOpacity={0.9}>
                <Text style={[styles.footerBtnText, { color: Colors.WHITE }]}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // ---------- Loading ----------
  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.PRIMARY} />
        <Text style={{ marginTop: 10, color: '#666' }}>Loading products...</Text>
      </View>
    );
  }

  // ---------- Screen ----------
  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.PRIMARY, '#ffffff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>{categoryTitle}</Text>
            <Text style={styles.headerSub}>Explore {products.length} items</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity
              onPress={() =>
                setSort((s) => (s === 'recent' ? 'low' : s === 'low' ? 'high' : s === 'high' ? 'rating' : 'recent'))
              }
              style={styles.sortPill}
              activeOpacity={0.9}
            >
              <Ionicons name="swap-vertical" size={14} color={Colors.PRIMARY} />
              <Text style={styles.sortText}>
                {sort === 'recent' ? 'Recent' : sort === 'low' ? 'Price ↑' : sort === 'high' ? 'Price ↓' : 'Top Rated'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFilterOpen(true)} style={styles.filterPill} activeOpacity={0.9}>
              <Ionicons name="filter" size={14} color={Colors.PRIMARY} />
              <Text style={styles.filterText}>Filters</Text>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={[{ id: 'all', name: 'All', image: { src: 'https://cdn-icons-png.flaticon.com/512/3233/3233481.png' } }, ...categories] as CategoryChipType[]}
          renderItem={renderCategoryChip}
          keyExtractor={(item) => String(item.id)}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        />
      </LinearGradient>

      <FlatList
        data={products}
        renderItem={({ item }) => <ProductCard item={item} />}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={{ paddingBottom: 60, paddingHorizontal: side }}
        removeClippedSubviews
        maxToRenderPerBatch={12}
        initialNumToRender={8}
        windowSize={7}
      />

      <FilterModal />
    </View>
  );
};

// ---------- Styles ----------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7fb' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { paddingTop: 55, paddingBottom: 8, paddingHorizontal: side, marginBottom: 5 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  headerSub: { fontSize: 12, color: '#f0f0f0', marginTop: 2 },

  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    marginRight: 8,
  },
  sortText: { color: Colors.PRIMARY, fontSize: 12, fontWeight: '700', marginLeft: 6 },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  filterText: { color: Colors.PRIMARY, fontSize: 12, fontWeight: '700', marginLeft: 6 },

  categoryRow: { paddingVertical: 10, paddingRight: side },
  catCard: {
    width: 80,
    height: 90,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    borderWidth: 1,
    borderColor: '#eee',
  },
  catCardActive: { borderColor: Colors.PRIMARY, borderWidth: 2, backgroundColor: '#f1f8ff' },
  catImg: { width: 40, height: 40, marginBottom: 6, borderRadius: 20, resizeMode: 'cover' },
  catText: { fontSize: 12, color: '#555', textAlign: 'center' },
  catActiveText: { color: Colors.PRIMARY, fontWeight: '600' },

  row: { justifyContent: 'space-between', marginBottom: gap },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    width: cardWidth,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  cardImage: { width: '100%', height: 130 },

  wishlistBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    padding: 6,
    borderRadius: 20,
    elevation: 3,
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: Colors.PRIMARY,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  cardInfo: { padding: 10 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 6, minHeight: 36 },
  priceBox: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  priceNow: { fontSize: 14, fontWeight: 'bold', color: Colors.PRIMARY, marginRight: 6 },
  priceOld: { fontSize: 12, color: '#aaa', textDecorationLine: 'line-through' },

  cartBtn: { borderRadius: 8, paddingVertical: 8, justifyContent: 'center', alignItems: 'center' },
  cartTxt: { color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 6 },

  // Modal
  modalWrap: { flex: 1, backgroundColor: 'rgba(17,24,39,0.35)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '88%',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  modalHeader: { paddingVertical: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: '#111827', fontSize: 16, fontWeight: '800' },

  section: { marginTop: 12 },
  sectionTitle: { color: '#111827', fontSize: 14, fontWeight: '800', marginBottom: 8 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: Colors.PRIMARY },
  chipText: { fontSize: 12, color: '#1F2937', fontWeight: '600' },
  chipTextActive: { color: Colors.PRIMARY },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  switchLabel: { color: '#111827', fontSize: 13, fontWeight: '600' },

  priceRow: { flexDirection: 'row', flexWrap: 'wrap' },

  ratingFilterRow: { flexDirection: 'row', marginTop: 8 },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    marginRight: 8,
  },
  ratingPillActive: { backgroundColor: Colors.PRIMARY },
  ratingPillText: { marginLeft: 6, fontSize: 12, fontWeight: '700', color: '#111827' },

  attrTitle: { color: '#374151', fontSize: 12, fontWeight: '700', marginBottom: 6 },

  modalFooter: { flexDirection: 'row', paddingVertical: 12, gap: 10 },
  footerBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  footerGhost: { backgroundColor: '#EEF2FF' },
  footerSolid: { backgroundColor: Colors.PRIMARY },
  footerBtnText: { fontSize: 14, fontWeight: '800' },
});

export default AllProductsScreen;

