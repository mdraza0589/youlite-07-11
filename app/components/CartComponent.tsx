// components/CartComponent.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { getCustomerById, getSession, updateCustomerById } from '@/lib/services/authService';
import { getProductDetail } from '@/lib/api/productApi';
import Colors from '@/utils/Colors';
import styles from './CartComponentStyle';
import Loading from './Loading';

interface CartItem {
  id: string;
  name: string;
  price: number;
  originalPrice: number;
  size: string;
  color: string;
  image: { uri: string };
  quantity: number;
}

const CartComponent = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string>('');
  const [busyQty, setBusyQty] = useState<Record<string, boolean>>({});
  const [busyRemove, setBusyRemove] = useState<Record<string, boolean>>({});

  const loadCart = useCallback(async () => {
    try {
      console.log('🛒 STARTING CART LOAD...');
      setLoading(true);
      setErrorText('');

      const session = await getSession();
      console.log('🛒 SESSION:', session);

      if (!session?.user?.id) {
        console.log('🛒 NO USER ID - SHOWING LOGIN MESSAGE');
        setErrorText('Please log in to view your cart.');
        setCartItems([]);
        setLoading(false);
        return;
      }

      setUserId(session.user.id);
      console.log('🛒 USER ID SET:', session.user.id);

      const customer = await getCustomerById(session.user.id);
      console.log('🛒 CUSTOMER DATA:', customer);

      if (!customer) {
        setErrorText('Failed to load customer data.');
        setCartItems([]);
        setLoading(false);
        return;
      }

      // Get cart data from meta_data
      const cartMeta = customer.meta_data?.find((m: any) => m.key === 'cart')?.value || [];
      console.log('🛒 CART META DATA:', cartMeta);
      console.log('🛒 CART ITEMS COUNT:', cartMeta.length);

      if (!Array.isArray(cartMeta) || cartMeta.length === 0) {
        console.log('🛒 CART IS EMPTY');
        setCartItems([]);
        setLoading(false);
        return;
      }

      const fetched: CartItem[] = [];

      for (const entry of cartMeta) {
        const { id, quantity } = entry;

        if (!id) {
          console.warn('🛒 SKIPPING ENTRY WITH NO ID:', entry);
          continue;
        }

        try {
          console.log(`🛒 FETCHING PRODUCT ${id}...`);
          const productResponse = await getProductDetail(id.toString());

          // Handle different response structures
          const productData = productResponse?.data || productResponse;

          if (!productData) {
            console.warn(`🛒 PRODUCT ${id} NOT FOUND`);
            continue;
          }

          console.log(`🛒 PRODUCT ${id} DATA:`, productData);

          // Extract product attributes
          const attrs = Array.isArray(productData.attributes) ? productData.attributes : [];
          const colorAttr = attrs.find((a: any) =>
            a?.name?.toLowerCase().includes('color') ||
            a?.slug?.toLowerCase().includes('color')
          );
          const sizeAttr = attrs.find((a: any) =>
            a?.name?.toLowerCase().includes('size') ||
            a?.slug?.toLowerCase().includes('size')
          );

          const color = colorAttr?.options?.[0] || 'Default';
          const size = sizeAttr?.options?.[0] || 'Default';

          // Get prices - handle different price fields
          const price = parseFloat(
            productData.sale_price ||
            productData.price ||
            productData.regular_price ||
            '0'
          );

          const originalPrice = parseFloat(
            productData.regular_price ||
            productData.price ||
            price.toString()
          );

          // Get image
          const imageUri =
            productData.images?.[0]?.src ||
            productData.image?.src ||
            'https://via.placeholder.com/100';

          const item: CartItem = {
            id: productData.id?.toString() || id.toString(),
            name: productData.name || 'Unnamed Product',
            price: isNaN(price) ? 0 : price,
            originalPrice: isNaN(originalPrice) ? price : originalPrice,
            size,
            color,
            image: { uri: imageUri },
            quantity: quantity || 1,
          };

          console.log(`🛒 ADDED ITEM:`, item);
          fetched.push(item);

        } catch (productError) {
          console.error(`🛒 ERROR LOADING PRODUCT ${id}:`, productError);
          // Continue with other products even if one fails
          continue;
        }
      }

      console.log('🛒 FINAL CART ITEMS:', fetched);
      setCartItems(fetched);

    } catch (err) {
      console.error('🛒 CART LOAD ERROR:', err);
      setErrorText('Failed to load cart. Please try again.');
      setCartItems([]);
    } finally {
      setLoading(false);
      console.log('🛒 CART LOAD COMPLETED');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCart();
    }, [loadCart])
  );

  const updateCartMeta = async (items: CartItem[]) => {
    if (!userId) return;

    const meta = items.map((it) => ({
      id: it.id,
      quantity: it.quantity
    }));

    try {
      await updateCustomerById(userId, {
        meta_data: [{ key: 'cart', value: meta }]
      });
      console.log('🛒 CART UPDATED SUCCESSFULLY');
    } catch (e) {
      console.error('🛒 CART UPDATE ERROR:', e);
      Alert.alert('Error', 'Failed to update cart');
    }
  };

  const updateQuantity = async (id: string, qty: number) => {
    if (qty < 1) return;

    setBusyQty((p) => ({ ...p, [id]: true }));
    const updated = cartItems.map((it) =>
      it.id === id ? { ...it, quantity: qty } : it
    );
    setCartItems(updated);
    await updateCartMeta(updated);
    setBusyQty((p) => ({ ...p, [id]: false }));
  };

  const removeItem = async (id: string) => {
    setBusyRemove((p) => ({ ...p, [id]: true }));
    const updated = cartItems.filter((it) => it.id !== id);
    setCartItems(updated);
    await updateCartMeta(updated);
    setBusyRemove((p) => ({ ...p, [id]: false }));
  };

  const calculateTotals = () => {
    const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    return {
      subtotal,
      totalQuantity,
      total: subtotal,
    };
  };

  const { subtotal, totalQuantity, total } = calculateTotals();

  // Loading state
  if (loading) {
    return (
      <View style={styles.loader}>
        <Loading />
      </View>
    );
  }

  // Error state
  if (errorText) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="cart-outline" size={64} color="#ccc" />
        <Text style={styles.errorText}>{errorText}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadCart}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: '#666' }]}
          onPress={() => router.push('/Login/LoginRegisterPage')}
        >
          <Text style={styles.retryText}>Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Empty cart state
  if (cartItems.length === 0) {
    return (
      <View style={styles.emptyCart}>
        <Ionicons name="cart-outline" size={80} color="#ddd" />
        <Text style={styles.emptyText}>Your cart is empty</Text>
        <Text style={styles.emptySubtext}>Browse our products and start adding items!</Text>
        <TouchableOpacity
          style={styles.shopButton}
          onPress={() => router.push('/(tabs)/Category')}
        >
          <Text style={styles.shopButtonText}>Shop Now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main cart view
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Cart</Text>
        <Text style={styles.cartCountText}>{totalQuantity} items</Text>
      </View>

      {/* Cart Items */}
      <ScrollView style={styles.itemsContainer} showsVerticalScrollIndicator={false}>
        <View>
          {cartItems.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              {/* Product Image */}
              <TouchableOpacity
                onPress={() => router.push({
                  pathname: '/pages/DetailsOfItem/ItemDetails',
                  params: {
                    id: item.id,
                    title: item.name
                  }
                })}
                style={styles.imageContainer}
              >
                <Image
                  source={{ uri: item.image.uri }}
                  style={styles.itemImage}
                />
              </TouchableOpacity>

              {/* Product Details */}
              <View style={styles.itemDetails}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.name}
                </Text>

                <Text style={styles.itemSizeColor}>
                  Size: {item.size} | Color: {item.color}
                </Text>

                {/* Price */}
                <View style={styles.priceContainer}>
                  <Text style={styles.itemPrice}>₹{item.price.toLocaleString()}</Text>
                  {item.originalPrice > item.price && (
                    <>
                      <Text style={styles.originalPrice}>
                        ₹{item.originalPrice.toLocaleString()}
                      </Text>
                      <Text style={styles.discountText}>
                        {Math.round(((item.originalPrice - item.price) / item.originalPrice) * 100)}% OFF
                      </Text>
                    </>
                  )}
                </View>

                {/* Quantity Controls */}
                <View style={styles.quantityContainer}>
                  <TouchableOpacity
                    onPress={() => updateQuantity(item.id, item.quantity - 1)}
                    style={styles.quantityButton}
                    disabled={busyQty[item.id] || item.quantity <= 1}
                  >
                    {busyQty[item.id] ? (
                      <ActivityIndicator size={16} color={Colors.PRIMARY} />
                    ) : (
                      <Ionicons name="remove" size={20} color="#333" />
                    )}
                  </TouchableOpacity>

                  <Text style={styles.quantityText}>{item.quantity}</Text>

                  <TouchableOpacity
                    onPress={() => updateQuantity(item.id, item.quantity + 1)}
                    style={styles.quantityButton}
                    disabled={busyQty[item.id]}
                  >
                    {busyQty[item.id] ? (
                      <ActivityIndicator size={16} color={Colors.PRIMARY} />
                    ) : (
                      <Ionicons name="add" size={20} color="#333" />
                    )}
                  </TouchableOpacity>

                  {/* Remove Button */}
                  <TouchableOpacity
                    onPress={() => removeItem(item.id)}
                    style={styles.removeButton}
                    disabled={busyRemove[item.id]}
                  >
                    {busyRemove[item.id] ? (
                      <ActivityIndicator size={14} color="#ff3f6c" />
                    ) : (
                      <Text style={styles.removeText}>Remove</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}

          <View style={styles.spacer} />
        </View>
      </ScrollView>

      {/* Checkout Footer */}
      <View style={styles.bottomContainer}>
        <View style={styles.summaryContainer}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal ({totalQuantity} items)</Text>
            <Text style={styles.summaryValue}>₹{subtotal.toLocaleString()}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery</Text>
            <Text style={styles.summaryValue}>FREE</Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₹{total.toLocaleString()}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.checkoutButton}
          onPress={() => router.push('/pages/Checkout/Checkout')}
        >
          <Text style={styles.checkoutText}>Proceed to Checkout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default CartComponent;