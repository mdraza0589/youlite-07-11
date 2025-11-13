import Colors from '@/utils/Colors';
import React, { useEffect, useState } from 'react';
import {
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import { getSession } from '@/lib/services/authService';
import Loading from '@/app/components/Loading';
import Dimenstion from '@/utils/Dimenstion';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

interface Product {
  id: number;
  name: string;
  images: { src: string }[];
}

const WC_PRODUCTS_API =
  'https://youlitestore.in/wp-json/wc/v3/products?consumer_key=ck_d75d53f48f9fb87921a2523492a995c741d368df&consumer_secret=cs_ae3184c5435dd5d46758e91fa9ed3917d85e0c17';
const PC_BASE = 'https://youlitestore.in/wp-json/product-chat/v1';
const PC_FETCH_API = `${PC_BASE}/fetch`;

const ChatListScreen = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const router = useRouter();

  useEffect(() => {
    initUser();
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setFilteredProducts(products);
    } else {
      const lower = searchQuery.toLowerCase();
      setFilteredProducts(
        products.filter((p) => p.name.toLowerCase().includes(lower))
      );
    }
  }, [searchQuery, products]);

  const initUser = async () => {
    const session = await getSession();
    if (session?.user?.id) {
      setUserId(session.user.id);
      await fetchProductsWithChats(session.user.id);
    } else {
      console.warn('No user session found.');
    }
  };

  const fetchProductsWithChats = async (customerId: number) => {
    try {
      setLoadingProducts(true);

      const res = await fetch(WC_PRODUCTS_API);
      const allProducts = await res.json();

      const productsWithMessages: Product[] = [];
      for (const product of allProducts) {
        const chatRes = await fetch(`${PC_FETCH_API}?product_id=${product.id}&customer_id=${customerId}`);
        if (chatRes.ok) {
          const chatData = await chatRes.json();
          if (chatData.length > 0) {
            productsWithMessages.push(product);
          }
        }
      }

      setProducts(productsWithMessages);
      setFilteredProducts(productsWithMessages);
      setLastRefreshed(new Date());
    } catch (e) {
      console.error('Fetch products error:', e);
      Alert.alert('Error', 'Failed to load conversations');
    } finally {
      setLoadingProducts(false);
    }
  };

  const onRefresh = async () => {
    if (!userId) {
      Alert.alert('Login Required', 'Please login to refresh conversations');
      return;
    }

    setRefreshing(true);
    try {
      await fetchProductsWithChats(userId);
    } catch (error) {
      console.error('Refresh products error:', error);
      Alert.alert('Refresh Failed', 'Could not refresh conversations');
    } finally {
      setRefreshing(false);
    }
  };

  const formatLastRefreshed = () => {
    if (!lastRefreshed) return '';
    return `Last updated: ${lastRefreshed.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })}`;
  };

  const renderProductItem = ({ item }: { item: Product }) => {
    return (
      <TouchableOpacity
        style={styles.productItem}
        onPress={() => router.push({pathname: '/pages/DetailsOfItem/ChatDetails',params: { productId: item.id.toString(), productName: item.name }
        })}
      >
        <Image
          source={{ uri: item.images[0]?.src || 'https://via.placeholder.com/50' }}
          style={styles.productAvatar}
        />
        <Text style={styles.productName}>{item.name}</Text>
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={'light-content'} backgroundColor={'transparent'} />
      <View style={styles.productListContainer}>
        <View style={styles.header}>
          <Text style={styles.headerText}>
            {userId ? 'Product Messages' : 'Please Login to View Messages'}
          </Text>
          {lastRefreshed && (
            <Text style={styles.lastRefreshedText}>{formatLastRefreshed()}</Text>
          )}
        </View>

        {userId && (
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            placeholderTextColor="gray"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        )}

        {loadingProducts ? (
          <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
            <Loading />
            <Text style={{ marginTop: 12, fontSize: 18, fontWeight: '600', color: Colors.SECONDARY }}>
              Loading your Chats
            </Text>
          </View>
        ) : !userId ? (
          <View style={styles.loginPrompt}>
            <Text style={styles.loginText}>You need to be logged in to view your messages.</Text>
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={styles.stateWrap}>
            <Ionicons name="chatbubbles-outline" size={64} color="#6B7280" />
            <Text style={styles.noResults}>No Messages found</Text>
            <Text style={styles.noResultsSub}>Start a conversation from product pages</Text>
            <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
              <Ionicons name="refresh" size={20} color={Colors.PRIMARY} />
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredProducts}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderProductItem}
            contentContainerStyle={styles.productList}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[Colors.PRIMARY]}
                tintColor={Colors.PRIMARY}
                title="Refreshing conversations..."
                titleColor={Colors.PRIMARY}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f7fb' },
  header: {
    padding: 16,
    backgroundColor: Colors.PRIMARY,
    marginBottom: 10,
    height: Dimenstion.headerHeight,
    justifyContent: 'flex-end',
    textAlign: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    alignItems: 'center',
  },
  headerText: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.WHITE,
    marginBottom: 4,
  },
  lastRefreshedText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.PRIMARY,
    marginTop: 16,
  },
  refreshButtonText: {
    color: Colors.PRIMARY,
    fontWeight: '600',
    marginLeft: 6,
  },
  stateWrap: {
    height: 600,
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    justifyContent: 'center'
  },
  noResults: {
    marginTop: 16,
    color: '#374151',
    fontSize: 18,
    fontWeight: '800'
  },
  noResultsSub: {
    marginTop: 8,
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center'
  },
  productListContainer: { flex: 1 },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  productList: { paddingBottom: 20 },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 8,
  },
  productAvatar: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1
  },
  loginPrompt: {
    padding: 20,
    alignItems: 'center'
  },
  loginText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center'
  },
});

export default ChatListScreen;