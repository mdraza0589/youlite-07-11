import React, { useState, useCallback } from 'react';
import { ScrollView, StatusBar, View, RefreshControl } from 'react-native';
import AutoSlider from '../components/AutoSlider';
import Category from '../components/ProductCategory';
// import CategoryTabs from '../components/CategoryTabs';
import HiddenGems from '../components/Featured';
import Header from '../components/Header';
import Latest from '../components/Latest';
import MainCard from '../components/Offer';
import PeopleAlsoViewed from '../components/PeopleViews';
import StaticBanner from '../components/StaticBanner';
import Colors from '@/utils/Colors';

const Home = () => {
  const [refreshing, setRefreshing] = useState(false);

  // This function runs when user pulls to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      // Simulate data re-fetch or reload process
      // You can add actual data fetching logic here
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      console.error('Error refreshing home:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Status Bar */}
      <StatusBar backgroundColor="transparent" barStyle="light-content" translucent={true} />

      <Header />
      {/* <CategoryTabs /> */}

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.PRIMARY]}
            tintColor="#007BFF"
          />
        }
      >
        <View>
          <MainCard />
          <Category />
          <AutoSlider />
          <HiddenGems />
          <StaticBanner />
          <Latest />
          <PeopleAlsoViewed />
        </View>
      </ScrollView>
    </View >
  );
};

export default Home;


