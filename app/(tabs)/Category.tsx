import imagePath from '@/constant/imagePath';
import { loadCategories } from '@/lib/services/categoryService';
import Colors from '@/utils/Colors';
import Dimenstion from '@/utils/Dimenstion';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import debounce from 'lodash.debounce';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const { width } = Dimensions.get('window');

// --- Types ---
type UICategory = {
  id: string;
  name: string;
  imageUri: string | null;
  parent: number;
  slug?: string;
  count?: number;
};

// --- Safe helpers ---
const safeStr = (v: any, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const safeNum = (v: any, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// --- Normalize Woo category into UI category ---
const normalizeCategory = (c: any): UICategory | null => {
  if (!c) return null;
  const idRaw = c?.id ?? c?.term_id ?? c?._id;
  if (idRaw === undefined || idRaw === null) return null;

  const id = String(idRaw);
  const name = safeStr(c?.name ?? c?.title ?? c?.label, '').trim() || 'Unnamed';
  const parent = safeNum(c?.parent ?? 0, 0);
  const imageUri = safeStr(c?.image?.src, '') || null;

  return {
    id,
    name,
    imageUri,
    parent,
    slug: safeStr(c?.slug, ''),
    count: safeNum(c?.count, 0),
  };
};

const toImageSource = (uri: string | null) =>
  uri && uri.trim().length > 0 ? { uri } : imagePath.image11;

// --- Main Component ---
const AllCategories: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState<UICategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredCats, setFilteredCats] = useState<UICategory[]>([]);

  const parents = useMemo(() => cats.filter((c) => c.parent === 0), [cats]);
  const selectedParent = useMemo(
    () => parents.find((p) => p.id === selectedCategoryId) ?? null,
    [parents, selectedCategoryId]
  );

  const children = useMemo(() => {
    if (selectedCategoryId === 'all') return parents;
    return selectedParent ? cats.filter((c) => c.parent === Number(selectedParent.id)) : [];
  }, [cats, selectedCategoryId, selectedParent, parents]);

  useEffect(() => {
    let mounted = true;
    const fetchCats = async () => {
      try {
        setLoading(true);
        const list = await loadCategories({ per_page: 100, hide_empty: false });
        const normalized = list.map(normalizeCategory).filter(Boolean) as UICategory[];
        if (mounted) setCats(normalized);
      } catch {
        if (mounted) setCats([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchCats();
    return () => {
      mounted = false;
    };
  }, []);

  const midIndex = Math.ceil(children.length / 2);
  const spotlight = children.slice(0, midIndex);
  const trending = children.slice(midIndex);

  const goToCategoryProducts = (id: string, title: string) =>
    router.push({ pathname: '/pages/AllCategory/CategoryProduct', params: { id, title } });

  const handleSelectCategory = (id: string) => setSelectedCategoryId(id);

  // --- Debounced Search ---
  const handleSearch = useCallback(
    debounce((text: string) => {
      if (!text.trim()) {
        setFilteredCats([]);
        return;
      }
      const q = text.toLowerCase();
      const filtered = cats.filter((c) => c.name.toLowerCase().includes(q));
      setFilteredCats(filtered);
    }, 300),
    [cats]
  );

  const onSearchChange = (text: string) => {
    setSearchQuery(text);
    handleSearch(text);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View></View>
        <Text style={styles.headerTitle}>Categories</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          placeholder="Search Categories..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={onSearchChange}
          style={styles.searchInput}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {searchQuery.trim().length > 0 ? (
        <ScrollView style={styles.searchResults}>
          {filteredCats.length === 0 ? (
            <View style={{ padding: 16 }}>
              <Text>No matching categories found</Text>
            </View>
          ) : (
            <View style={styles.gridContainer}>
              {filteredCats.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.gridItem}
                  onPress={() => goToCategoryProducts(item.id, item.name)}
                >
                  <Image source={toImageSource(item.imageUri)} style={styles.gridImage} />
                  <Text style={styles.gridText} numberOfLines={2}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.mainContent}>
          {/* Left Sidebar */}
          <ScrollView
            style={styles.leftNav}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.leftNavContent}
          >
            {loading ? (
              <View style={{ padding: 12 }}>
                <Text>Loading...</Text>
              </View>
            ) : parents.length === 0 ? (
              <View style={{ padding: 12 }}>
                <Text>No categories</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[
                    styles.mainCategoryItem,
                    selectedCategoryId === 'all' && styles.mainCategoryItemSelected,
                  ]}
                  onPress={() => handleSelectCategory('all')}
                >
                  <Ionicons name="grid" size={24} color="#333" />
                  <Text style={styles.mainCategoryText}>All</Text>
                </TouchableOpacity>

                {parents.map((item) => {
                  const isSelected = selectedCategoryId === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.mainCategoryItem,
                        isSelected && styles.mainCategoryItemSelected,
                      ]}
                      onPress={() => goToCategoryProducts(item.id, item.name)}
                    >
                      <Image source={toImageSource(item.imageUri)} style={styles.mainCategoryImage} />
                      <Text style={styles.mainCategoryText} numberOfLines={2}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>

          {/* Right Panel */}
          <ScrollView style={styles.rightContent} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={styles.section}>
                <Text style={{ padding: 16 }}>Loading...</Text>
              </View>
            ) : children.length === 0 ? (
              <View style={styles.section}>
                <Text style={{ padding: 16 }}>No categories found</Text>
              </View>
            ) : selectedCategoryId === 'all' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>All Categories</Text>
                <View style={styles.gridContainer}>
                  {children.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.gridItem}
                      onPress={() => goToCategoryProducts(item.id, item.name)}
                    >
                      <Image source={toImageSource(item.imageUri)} style={styles.gridImage} />
                      <Text style={styles.gridText} numberOfLines={2}>
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>In The Spotlight</Text>
                  <View style={styles.gridContainer}>
                    {spotlight.length === 0 ? (
                      <Text style={{ padding: 8 }}>No subcategories</Text>
                    ) : (
                      spotlight.map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.gridItem}
                          onPress={() => goToCategoryProducts(item.id, item.name)}
                        >
                          <Image source={toImageSource(item.imageUri)} style={styles.gridImage} />
                          <Text style={styles.gridText} numberOfLines={2}>
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Trending Stores</Text>
                  <View style={styles.gridContainer}>
                    {trending.length === 0 ? (
                      <Text style={{ padding: 8 }}>No subcategories</Text>
                    ) : (
                      trending.map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.gridItem}
                          onPress={() => goToCategoryProducts(item.id, item.name)}
                        >
                          <Image source={toImageSource(item.imageUri)} style={styles.gridImage} />
                          <Text style={styles.gridText} numberOfLines={2}>
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

export default AllCategories;

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    backgroundColor: Colors.PRIMARY,
    paddingVertical: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    height: Dimenstion.headerHeight,
    marginBottom: 12,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: Colors.WHITE },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F3F3',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#333',
  },
  mainContent: { flex: 1, flexDirection: 'row' },
  leftNav: { width: width * 0.2, backgroundColor: '#F8F8F8' },
  leftNavContent: { flexGrow: 1 },
  mainCategoryItem: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 },
  mainCategoryItemSelected: {
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 3,
    borderLeftColor: Colors.PRIMARY,
  },
  mainCategoryImage: { width: 40, height: 40, borderRadius: 20, marginBottom: 4 },
  mainCategoryText: { fontSize: 10, textAlign: 'center', color: '#333', paddingHorizontal: 2 },
  rightContent: { width: width * 0.8, padding: 12 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 16, color: '#282c3f' },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  gridItem: {
    width: '32%',
    padding: 10,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },

  gridImage: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#EAEAEA', marginBottom: 8 },
  gridText: { fontSize: 12, textAlign: 'center', color: '#555' },
  searchResults: { flex: 1, paddingHorizontal: 16 },
});
