import React, { useState, useEffect, useMemo, createContext, useContext, useCallback } from 'react';
import * as XLSX from 'xlsx/xlsx.mjs';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  onSnapshot,
  enableIndexedDbPersistence,
  CACHE_SIZE_UNLIMITED
} from 'firebase/firestore';

// ==================== FIREBASE CONFIGURATION ====================
const firebaseConfig = {
  apiKey: "AIzaSyDsMMnBxmbjWKMjbo7LgHSxkXvsiAFqECQ",
  authDomain: "cng1-52988.firebaseapp.com",
  projectId: "cng1-52988",
  storageBucket: "cng1-52988.firebasestorage.app",
  messagingSenderId: "571737901914",
  appId: "1:571737901914:web:3063630d441b07b9b84163",
  measurementId: "G-H30941HNR5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db, { cacheSizeBytes: CACHE_SIZE_UNLIMITED })
  .then(() => {
    console.log("Firebase offline persistence enabled");
  })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("Multiple tabs open, offline persistence only works in one tab");
    } else if (err.code === 'unimplemented') {
      console.warn("Browser doesn't support offline persistence");
    }
  });

// Collection names
const COLLECTIONS = {
  CUSTOMERS: 'customers',
  PRODUCTS: 'products',
  MAPPINGS: 'mappings',
  SERVICES: 'services',
  LOGS: 'logs'
};

// ==================== UNIFIED DATA STRUCTURE ====================
const initialUnifiedData = {
  raw: {
    customers: [],
    products: [],
    mappings: [],
    services: [],
    logs: []
  },
  
  views: {
    customers: [],
    products: [],
    assignments: [],
    serviceHistory: [],
    reminders: [],
    activityLogs: []
  },
  
  stats: {
    totalCustomers: 0,
    totalProducts: 0,
    totalAssignments: 0,
    totalServices: 0,
    totalLogs: 0,
    expiringThisWeek: 0,
    expiringThisMonth: 0,
    pendingServices: 0
  },
  
  meta: {
    lastUpdated: null,
    isOnline: true,
    hasPendingChanges: false,
    dataVersion: 1
  }
};

// ==================== UNIFIED DATA CONTEXT ====================
const UnifiedDataContext = createContext();

export const UnifiedDataProvider = ({ children }) => {
  const [unifiedData, setUnifiedData] = useState(initialUnifiedData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const calculateViews = useCallback((rawData) => {
    const { customers, products, mappings, services, logs } = rawData;
    
    console.log('Calculating all data views...');
    
    const customersView = customers.map(customer => {
      const customerMappings = mappings.filter(m => m.customer_id === customer.id);
      const customerProducts = customerMappings.map(mapping => {
        const product = products.find(p => p.id === mapping.product_id);
        return {
          ...mapping,
          product_details: product || {},
          product_name: product?.product_name || 'Unknown',
          warranty_expiry_date: mapping.warranty_expiry_date,
          warranty_months: mapping.product_warranty_period
        };
      });
      
      const customerServices = services.filter(s => s.customer_id === customer.id);
      const customerLogs = logs.filter(l => l.customer_id === customer.id);
      
      return {
        ...customer,
        products: customerProducts,
        services: customerServices,
        logs: customerLogs,
        total_products: customerProducts.length,
        total_services: customerServices.length,
        total_logs: customerLogs.length,
        full_name: `${customer.first_name} ${customer.last_name}`
      };
    });
    
    const productsView = products.map(product => {
      const productMappings = mappings.filter(m => m.product_id === product.id);
      const productCustomers = productMappings.map(mapping => {
        const customer = customers.find(c => c.id === mapping.customer_id);
        return {
          ...mapping,
          customer_details: customer || {},
          customer_name: customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown',
          vehicle_number: customer?.vehicle_number || 'N/A'
        };
      });
      
      const productServices = services.filter(s => s.product_id === product.id);
      
      return {
        ...product,
        assignments: productCustomers,
        services: productServices,
        total_assignments: productCustomers.length,
        total_services: productServices.length
      };
    });
    
    const assignmentsView = mappings.map(mapping => {
      const customer = customers.find(c => c.id === mapping.customer_id);
      const product = products.find(p => p.id === mapping.product_id);
      
      const expiryDate = mapping.warranty_expiry_date ? new Date(mapping.warranty_expiry_date) : null;
      const today = new Date();
      const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24)) : null;
      
      return {
        ...mapping,
        customer_details: customer || {},
        product_details: product || {},
        customer_name: customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown',
        product_name: product ? product.product_name : 'Unknown',
        vehicle_number: customer ? customer.vehicle_number : 'N/A',
        mobile_number: customer ? customer.mobile_number : 'N/A',
        days_until_expiry: daysUntilExpiry,
        is_expired: daysUntilExpiry < 0,
        is_expiring_soon: daysUntilExpiry !== null && daysUntilExpiry <= 30
      };
    });
    
    const serviceHistoryView = services.map(service => {
      const customer = customers.find(c => c.id === service.customer_id);
      const product = products.find(p => p.id === service.product_id);
      
      return {
        ...service,
        customer_details: customer || {},
        product_details: product || {},
        customer_name: customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown',
        product_name: product ? product.product_name : 'Unknown',
        vehicle_number: customer ? customer.vehicle_number : 'N/A'
      };
    });
    
    const today = new Date();
    const remindersView = mappings
      .filter(mapping => {
        if (!mapping.warranty_expiry_date) return false;
        const expiryDate = new Date(mapping.warranty_expiry_date);
        return expiryDate > today && !mapping.reminder_status?.warranty_renewed;
      })
      .map(mapping => {
        const customer = customers.find(c => c.id === mapping.customer_id);
        const product = products.find(p => p.id === mapping.product_id);
        const expiryDate = new Date(mapping.warranty_expiry_date);
        const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
        
        let reminderLevel = 'info';
        if (daysUntilExpiry <= 1) reminderLevel = 'critical';
        else if (daysUntilExpiry <= 7) reminderLevel = 'warning';
        else if (daysUntilExpiry <= 30) reminderLevel = 'info';
        
        let reminderToSend = null;
        if (daysUntilExpiry === 30 && !mapping.reminder_status?.rem_1_sent) reminderToSend = 'rem_1_sent';
        else if (daysUntilExpiry === 15 && !mapping.reminder_status?.rem_2_sent) reminderToSend = 'rem_2_sent';
        else if (daysUntilExpiry === 1 && !mapping.reminder_status?.rem_3_sent) reminderToSend = 'rem_3_sent';
        
        return {
          ...mapping,
          customer_details: customer || {},
          product_details: product || {},
          customer_name: customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown',
          product_name: product ? product.product_name : 'Unknown',
          vehicle_number: customer ? customer.vehicle_number : 'N/A',
          mobile_number: customer ? customer.mobile_number : 'N/A',
          expiry_date: mapping.warranty_expiry_date,
          days_until_expiry: daysUntilExpiry,
          reminder_level: reminderLevel,
          reminder_to_send: reminderToSend,
          is_expiring_soon: daysUntilExpiry <= 30,
          is_expiring_this_week: daysUntilExpiry <= 7,
          is_expiring_today: daysUntilExpiry <= 1
        };
      })
      .sort((a, b) => a.days_until_expiry - b.days_until_expiry);
    
    const activityLogsView = logs
      .map(log => {
        const customer = customers.find(c => c.id === log.customer_id);
        const product = products.find(p => p.id === log.product_id);
        
        return {
          ...log,
          customer_details: customer || {},
          product_details: product || {},
          customer_name: customer ? `${customer.first_name} ${customer.last_name}` : 'Unknown',
          product_name: product ? product.product_name : 'Unknown',
          vehicle_number: customer ? customer.vehicle_number : 'N/A'
        };
      })
      .sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
    
    const stats = {
      totalCustomers: customers.length,
      totalProducts: products.length,
      totalAssignments: mappings.length,
      totalServices: services.length,
      totalLogs: logs.length,
      expiringThisWeek: remindersView.filter(r => r.days_until_expiry <= 7).length,
      expiringThisMonth: remindersView.filter(r => r.days_until_expiry <= 30).length,
      pendingServices: services.filter(s => s.service_status === 'Pending').length,
      activeWarranties: mappings.filter(m => {
        if (!m.warranty_expiry_date) return false;
        const expiryDate = new Date(m.warranty_expiry_date);
        return expiryDate > today && !m.reminder_status?.warranty_renewed;
      }).length,
      renewedWarranties: mappings.filter(m => m.reminder_status?.warranty_renewed).length
    };
    
    return {
      customers: customersView,
      products: productsView,
      assignments: assignmentsView,
      serviceHistory: serviceHistoryView,
      reminders: remindersView,
      activityLogs: activityLogsView,
      stats
    };
  }, []);
  
  const loadAllData = useCallback(async () => {
    try {
      console.log('Loading all data from Firebase...');
      setLoading(true);
      
      const [
        customersSnapshot,
        productsSnapshot,
        mappingsSnapshot,
        servicesSnapshot,
        logsSnapshot
      ] = await Promise.all([
        getDocs(collection(db, COLLECTIONS.CUSTOMERS)),
        getDocs(collection(db, COLLECTIONS.PRODUCTS)),
        getDocs(collection(db, COLLECTIONS.MAPPINGS)),
        getDocs(collection(db, COLLECTIONS.SERVICES)),
        getDocs(collection(db, COLLECTIONS.LOGS))
      ]);
      
      const rawData = {
        customers: customersSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          firebase_id: doc.id,
          ...doc.data()
        })),
        products: productsSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          firebase_id: doc.id,
          ...doc.data()
        })),
        mappings: mappingsSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          firebase_id: doc.id,
          ...doc.data()
        })),
        services: servicesSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          firebase_id: doc.id,
          ...doc.data()
        })),
        logs: logsSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          firebase_id: doc.id,
          ...doc.data()
        }))
      };
      
      console.log('Data loaded:', {
        customers: rawData.customers.length,
        products: rawData.products.length,
        mappings: rawData.mappings.length,
        services: rawData.services.length,
        logs: rawData.logs.length
      });
      
      const views = calculateViews(rawData);
      
      const newUnifiedData = {
        raw: rawData,
        views: views,
        stats: views.stats,
        meta: {
          lastUpdated: new Date().toISOString(),
          isOnline: navigator.onLine,
          hasPendingChanges: false,
          dataVersion: unifiedData.meta.dataVersion + 1
        }
      };
      
      setUnifiedData(newUnifiedData);
      
      localStorage.setItem('unified_data_cache', JSON.stringify({
        data: newUnifiedData,
        timestamp: Date.now(),
        version: '2.0'
      }));
      
      console.log('Unified data updated and cached');
      setError(null);
      
    } catch (error) {
      console.error('Error loading data:', error);
      setError(error.message);
      
      try {
        const cached = localStorage.getItem('unified_data_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < 30 * 60 * 1000) {
            console.log('Using cached data');
            setUnifiedData(parsed.data);
          }
        }
      } catch (cacheError) {
        console.error('Error loading cache:', cacheError);
      }
    } finally {
      setLoading(false);
    }
  }, [calculateViews, unifiedData.meta.dataVersion]);
  
  useEffect(() => {
    console.log('Setting up real-time listeners...');
    
    const unsubscribers = [];
    
    Object.values(COLLECTIONS).forEach(collectionName => {
      const unsubscribe = onSnapshot(
        collection(db, collectionName),
        () => {
          console.log(`${collectionName} collection updated, reloading all data`);
          loadAllData();
        },
        (error) => {
          console.error(`${collectionName} listener error:`, error);
          setError(prev => ({ ...prev, [collectionName]: error.message }));
        }
      );
      unsubscribers.push(unsubscribe);
    });
    
    loadAllData();
    
    return () => {
      console.log('Cleaning up listeners');
      unsubscribers.forEach(unsub => unsub());
    };
  }, [loadAllData]);
  
  const addItem = useCallback(async (collectionName, itemData) => {
    try {
      console.log(`Adding to ${collectionName}:`, itemData);
      
      const docRef = await addDoc(collection(db, collectionName), {
        ...itemData,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp()
      });
      
      const newItem = { 
        id: docRef.id, 
        firebase_id: docRef.id,
        ...itemData 
      };
      
      setUnifiedData(prev => {
        const newRaw = {
          ...prev.raw,
          [collectionName]: [...prev.raw[collectionName], newItem]
        };
        
        const views = calculateViews(newRaw);
        
        return {
          raw: newRaw,
          views: views,
          stats: views.stats,
          meta: {
            ...prev.meta,
            lastUpdated: new Date().toISOString(),
            hasPendingChanges: true
          }
        };
      });
      
      if (collectionName === COLLECTIONS.MAPPINGS || collectionName === COLLECTIONS.SERVICES) {
        const logData = {
          customer_id: itemData.customer_id,
          product_id: itemData.product_id,
          action: collectionName === COLLECTIONS.MAPPINGS ? 'Product Assignment' : 'Service Record',
          date: new Date().toISOString(),
          notes: itemData.notes || `${collectionName === COLLECTIONS.MAPPINGS ? 'Product assigned' : 'Service recorded'}`,
          log_type: collectionName === COLLECTIONS.MAPPINGS ? 'Warranty/Sales' : 'Service',
          created_at: new Date().toISOString()
        };
        
        await addDoc(collection(db, COLLECTIONS.LOGS), {
          ...logData,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
      }
      
      return { 
        success: true, 
        id: docRef.id, 
        item: newItem,
        message: 'Added successfully'
      };
      
    } catch (error) {
      console.error(`Error adding to ${collectionName}:`, error);
      return { 
        success: false, 
        error: error.message,
        message: `Add failed: ${error.message}`
      };
    }
  }, [calculateViews]);
  
  const updateItem = useCallback(async (collectionName, id, updates) => {
    try {
      console.log(`Updating ${collectionName}/${id}:`, updates);
      
      const docRef = doc(db, collectionName, id);
      await updateDoc(docRef, {
        ...updates,
        updated_at: serverTimestamp()
      });
      
      setUnifiedData(prev => {
        const newRaw = {
          ...prev.raw,
          [collectionName]: prev.raw[collectionName].map(item => 
            item.id === id ? { ...item, ...updates } : item
          )
        };
        
        const views = calculateViews(newRaw);
        
        return {
          raw: newRaw,
          views: views,
          stats: views.stats,
          meta: {
            ...prev.meta,
            lastUpdated: new Date().toISOString(),
            hasPendingChanges: true
          }
        };
      });
      
      return { success: true, message: 'Updated successfully' };
      
    } catch (error) {
      console.error(`Error updating ${collectionName}:`, error);
      return { success: false, error: error.message };
    }
  }, [calculateViews]);
  
  const deleteItem = useCallback(async (collectionName, id) => {
    try {
      console.log(`Deleting ${collectionName}/${id}`);
      
      const docRef = doc(db, collectionName, id);
      await deleteDoc(docRef);
      
      setUnifiedData(prev => {
        const newRaw = {
          ...prev.raw,
          [collectionName]: prev.raw[collectionName].filter(item => item.id !== id)
        };
        
        const views = calculateViews(newRaw);
        
        return {
          raw: newRaw,
          views: views,
          stats: views.stats,
          meta: {
            ...prev.meta,
            lastUpdated: new Date().toISOString(),
            hasPendingChanges: true
          }
        };
      });
      
      return { success: true, message: 'Deleted successfully' };
      
    } catch (error) {
      console.error(`Error deleting ${collectionName}:`, error);
      return { success: false, error: error.message };
    }
  }, [calculateViews]);
  
  const refreshData = useCallback(() => {
    console.log('Manually refreshing data');
    setLoading(true);
    loadAllData();
  }, [loadAllData]);
  
  const clearCache = useCallback(() => {
    localStorage.removeItem('unified_data_cache');
    refreshData();
  }, [refreshData]);
  
  const value = {
    data: unifiedData,
    loading,
    error,
    customers: unifiedData.views.customers,
    products: unifiedData.views.products,
    assignments: unifiedData.views.assignments,
    services: unifiedData.views.serviceHistory,
    reminders: unifiedData.views.reminders,
    logs: unifiedData.views.activityLogs,
    stats: unifiedData.stats,
    meta: unifiedData.meta,
    addItem,
    updateItem,
    deleteItem,
    refreshData,
    clearCache,
    findCustomer: (id) => unifiedData.views.customers.find(c => c.id === id),
    findProduct: (id) => unifiedData.views.products.find(p => p.id === id),
    findAssignment: (id) => unifiedData.views.assignments.find(a => a.id === id),
    findService: (id) => unifiedData.views.serviceHistory.find(s => s.id === id),
    getCustomerProducts: (customerId) => 
      unifiedData.views.assignments.filter(a => a.customer_id === customerId),
    getCustomerServices: (customerId) => 
      unifiedData.views.serviceHistory.filter(s => s.customer_id === customerId),
    getCustomerLogs: (customerId) => 
      unifiedData.views.activityLogs.filter(l => l.customer_id === customerId),
    hasProductAssignment: (customerId, productId) => 
      unifiedData.views.assignments.some(a => 
        a.customer_id === customerId && a.product_id === productId
      )
  };
  
  return (
    <UnifiedDataContext.Provider value={value}>
      {children}
    </UnifiedDataContext.Provider>
  );
};

export const useUnifiedData = () => {
  const context = useContext(UnifiedDataContext);
  if (!context) {
    throw new Error('useUnifiedData must be used within UnifiedDataProvider');
  }
  return context;
};

const calculateExpiryDate = (purchaseDate, warrantyMonths) => {
  if (!purchaseDate || !warrantyMonths) return null;
  const date = new Date(purchaseDate);
  date.setMonth(date.getMonth() + parseInt(warrantyMonths, 10));
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  
  if (dateString.toDate) {
    return dateString.toDate().toLocaleDateString('en-GB');
  }
  
  try {
    return new Date(dateString).toLocaleDateString('en-GB');
  } catch (error) {
    return 'Invalid Date';
  }
};

const Card = ({ children, title, className = '' }) => (
  <div className={`bg-white p-4 md:p-6 rounded-xl shadow-lg ${className}`}>
    {title && <h2 className="text-lg md:text-xl font-semibold text-gray-800 mb-4 border-b pb-2">{title}</h2>}
    {children}
  </div>
);

const Button = ({ children, onClick, color = 'blue', disabled = false, className = '', type = 'button' }) => (
  <button
    onClick={onClick}
    type={type}
    disabled={disabled}
    className={`px-3 md:px-4 py-2 rounded-lg font-medium transition duration-150 ease-in-out text-sm md:text-base ${className}
    ${disabled ? 'bg-gray-400 cursor-not-allowed' :
      color === 'blue' ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md' :
      color === 'red' ? 'bg-red-600 hover:bg-red-700 text-white shadow-md' :
      color === 'green' ? 'bg-green-600 hover:bg-green-700 text-white shadow-md' :
      'bg-gray-200 hover:bg-gray-300 text-gray-800 shadow-sm'
    }`}
  >
    {children} 
  </button>
);

const Input = ({ label, name, type = 'text', value, onChange, placeholder = '', required = false, disabled = false }) => (
  <div className="mb-4">
    <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      type={type}
      name={name}
      id={name}
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 text-sm md:text-base"
    />
  </div>
);

const Select = ({ label, name, value, onChange, options, required = false }) => (
  <div className="mb-4">
    <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <select
      name={name}
      id={name}
      value={value || ''}
      onChange={onChange}
      required={required}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white text-sm md:text-base"
    >
      <option value="" disabled>Select {label}</option>
      {options.map((option, index) => (
        <option key={index} value={option.value}>{option.label}</option>
      ))}
    </select>
  </div>
);

const SalesAssignment = () => {
  const { 
    customers, 
    products, 
    assignments,
    addItem,
    loading,
    meta
  } = useUnifiedData();
  
  const [customerType, setCustomerType] = useState('new');
  const [customerData, setCustomerData] = useState({
    first_name: '', last_name: '', mobile_number: '', whatsapp_number: '',
    address: '', city: '', state: '', vehicle_number: '', vehicle_model: ''
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [mappingData, setMappingData] = useState({
    product_id: '',
    product_purchase_date: new Date().toISOString().split('T')[0],
    product_warranty_period: 12,
    notes: ''
  });
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  console.log('Sales Module - Customers:', customers.length);
  console.log('Sales Module - Products:', products.length);
  console.log('Sales Module - Assignments:', assignments.length);
  
  useEffect(() => {
    const purchaseDate = mappingData.product_purchase_date;
    const warrantyMonths = mappingData.product_warranty_period;

    if (purchaseDate && warrantyMonths) {
      const expiryDate = calculateExpiryDate(purchaseDate, warrantyMonths);
      setMappingData(prev => ({
        ...prev,
        warranty_expiry_date: expiryDate,
      }));
    } else {
      setMappingData(prev => ({
        ...prev,
        warranty_expiry_date: '',
      }));
    }
  }, [mappingData.product_purchase_date, mappingData.product_warranty_period]);
  
  const handleCustomerChange = (e) => {
    setCustomerData({ ...customerData, [e.target.name]: e.target.value });
  };
  
  const handleMappingChange = (e) => {
    const { name, value } = e.target;
    let newMappingData = { ...mappingData, [name]: value };

    if (name === 'product_id' && value) {
      const selectedProduct = products.find(p => p.id === value);
      if (selectedProduct) {
        newMappingData.product_warranty_period = selectedProduct.warranty_period_months || 12;
      }
    }
    setMappingData(newMappingData);
  };
  
  const handleSaveAssignment = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsSubmitting(true);
    
    let finalCustomerId = selectedCustomerId;
    let customerName = '';
    
    try {
      if (customerType === 'new') {
        if (!customerData.first_name || !customerData.mobile_number || !customerData.vehicle_number) {
          setMessage('Error: Please fill all required customer fields.');
          setIsSubmitting(false);
          return;
        }
        
        const result = await addItem(COLLECTIONS.CUSTOMERS, {
          ...customerData,
          created_at: new Date().toISOString()
        });
        
        if (!result.success) throw new Error(result.error);
        
        finalCustomerId = result.id;
        customerName = customerData.first_name;
      } else {
        if (!selectedCustomerId) {
          setMessage('Error: Please select an existing customer.');
          setIsSubmitting(false);
          return;
        }
        const existingCustomer = customers.find(c => c.id === selectedCustomerId);
        if (!existingCustomer) {
          setMessage('Error: Selected customer not found.');
          setIsSubmitting(false);
          return;
        }
        customerName = existingCustomer.first_name || 'Existing Customer';
      }
      
      if (!mappingData.product_id || !mappingData.product_purchase_date) {
        setMessage('Error: Please fill all required product fields.');
        setIsSubmitting(false);
        return;
      }
      
      const mappingToSave = {
        customer_id: finalCustomerId,
        product_id: mappingData.product_id,
        product_purchase_date: mappingData.product_purchase_date,
        product_warranty_period: mappingData.product_warranty_period,
        warranty_expiry_date: mappingData.warranty_expiry_date,
        reminder_status: {
          rem_1_sent: false,
          rem_2_sent: false,
          rem_3_sent: false,
          renewal_sent: false,
          warranty_renewed: false
        },
        notes: mappingData.notes || '',
        created_at: new Date().toISOString()
      };
      
      const mappingResult = await addItem(COLLECTIONS.MAPPINGS, mappingToSave);
      if (!mappingResult.success) throw new Error(mappingResult.error);
      
      setMessage(`Success! ${customerName}'s assignment saved.`);
      
      setCustomerData({
        first_name: '', last_name: '', mobile_number: '', whatsapp_number: '',
        address: '', city: '', state: '', vehicle_number: '', vehicle_model: ''
      });
      setSelectedCustomerId('');
      setMappingData({
        product_id: '',
        product_purchase_date: new Date().toISOString().split('T')[0],
        product_warranty_period: 12,
        notes: ''
      });
      
    } catch (error) {
      console.error("Error saving sales assignment:", error);
      setMessage(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading data...</p>
      </div>
    );
  }
  
  const productOptions = products.map(p => ({ 
    value: p.id, 
    label: `${p.product_name || 'N/A'} (${p.product_type || 'N/A'} - ${p.warranty_period_months || 12}M)` 
  }));
  
  const customerOptions = customers.map(c => ({ 
    value: c.id, 
    label: `${c.first_name || ''} ${c.last_name || ''} (${c.vehicle_number || 'N/A'})` 
  }));
  
  return (
    <div className="space-y-6 px-4 md:px-0">
      <h1 className="text-xl md:text-3xl font-bold text-gray-800">New Sales Assignment</h1>
      
      {!meta.isOnline && (
        <div className="p-3 bg-yellow-100 text-yellow-800 rounded-lg flex items-center">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          You are offline. Data will sync when connection is restored.
        </div>
      )}
      
      {message && (
        <div className={`p-4 rounded-lg font-medium mx-4 md:mx-0 ${
          message.startsWith('Success') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message}
        </div>
      )}
      
      <form onSubmit={handleSaveAssignment} className="space-y-6">
        <Card title="Customer Identification">
          <div className="flex flex-col md:flex-row md:space-x-6 space-y-4 md:space-y-0">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="customerType"
                value="new"
                checked={customerType === 'new'}
                onChange={() => { setCustomerType('new'); setSelectedCustomerId(''); }}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <span className="text-gray-700 font-medium">New Customer</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="customerType"
                value="existing"
                checked={customerType === 'existing'}
                onChange={() => { setCustomerType('existing'); setCustomerData({
                  first_name: '', last_name: '', mobile_number: '', whatsapp_number: '',
                  address: '', city: '', state: '', vehicle_number: '', vehicle_model: ''
                }); }}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <span className="text-gray-700 font-medium">Existing Customer</span>
            </label>
          </div>
        </Card>
        
        <Card title={customerType === 'new' ? "New Customer Details" : "Select Existing Customer"}>
          {customerType === 'new' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input label="First Name" name="first_name" value={customerData.first_name} onChange={handleCustomerChange} required />
              <Input label="Last Name" name="last_name" value={customerData.last_name} onChange={handleCustomerChange} required />
              <Input label="Mobile Number" name="mobile_number" value={customerData.mobile_number} onChange={handleCustomerChange} required />
              <Input label="Vehicle Number" name="vehicle_number" value={customerData.vehicle_number} onChange={handleCustomerChange} required />
              <Input label="Vehicle Model" name="vehicle_model" value={customerData.vehicle_model} onChange={handleCustomerChange} required />
              <Input label="WhatsApp Number" name="whatsapp_number" value={customerData.whatsapp_number} onChange={handleCustomerChange} />
              <Input label="City" name="city" value={customerData.city} onChange={handleCustomerChange} />
              <Input label="State" name="state" value={customerData.state} onChange={handleCustomerChange} />
              <div className="md:col-span-3">
                <Input label="Address" name="address" value={customerData.address} onChange={handleCustomerChange} />
              </div>
            </div>
          ) : (
            <Select
              label="Select Customer"
              name="selected_customer_id"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              options={customerOptions}
              required
            />
          )}
        </Card>
        
        <Card title="Product Assignment">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select label="Product" name="product_id" value={mappingData.product_id} onChange={handleMappingChange} options={productOptions} required />
            <Input label="Purchase Date" name="product_purchase_date" value={mappingData.product_purchase_date} onChange={handleMappingChange} required type="date" />
            <Input label="Warranty Period (Months)" name="product_warranty_period" value={mappingData.product_warranty_period} onChange={handleMappingChange} required type="number" />
            <Input label="Warranty Expiry Date" name="warranty_expiry_date" value={formatDate(mappingData.warranty_expiry_date)} disabled />
            <div className="md:col-span-2">
              <Input label="Notes" name="notes" value={mappingData.notes} onChange={handleMappingChange} />
            </div>
          </div>
        </Card>
        
        <div className="flex justify-center">
          <Button 
            type="submit" 
            color="blue" 
            className="w-full md:w-64 py-3 text-lg font-bold"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : `Save ${customerType === 'new' ? 'New Customer' : 'Assignment'}`}
          </Button>
        </div>
      </form>
    </div>
  );
};

const CustomerManagement = () => {
  const { 
    customers,
    logs,
    assignments,
    services,
    deleteItem,
    findCustomer,
    getCustomerProducts,
    getCustomerServices,
    getCustomerLogs,
    loading,
    stats
  } = useUnifiedData();
  
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '', last_name: '', mobile_number: '', whatsapp_number: '',
    address: '', city: '', state: '', vehicle_number: '', vehicle_model: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState('');
  
  console.log('Customer Management - Total Customers:', stats.totalCustomers);
  console.log('Customer Management - Total Assignments:', stats.totalAssignments);
  console.log('Customer Management - Total Services:', stats.totalServices);
  
  const handleViewDetails = (customer) => {
    setSelectedCustomerId(customer.id);
    setSelectedCustomerName(`${customer.first_name} ${customer.last_name}`);
  };
  
  const handleEditCustomer = (customer) => {
    setFormData({ ...customer });
    setIsEditing(true);
    setShowCustomerForm(true);
  };
  
  const handleDeleteCustomer = async (id, name) => {
    if (window.confirm(`Delete customer ${name}? This will also delete all related assignments and services!`)) {
      const result = await deleteItem(COLLECTIONS.CUSTOMERS, id);
      if (result.success) {
        alert(`Customer ${name} deleted successfully!`);
      } else {
        alert(`Error: ${result.error}`);
      }
    }
  };
  
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading customer data...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6 px-4 md:px-0">
      <h1 className="text-xl md:text-3xl font-bold text-gray-800">Customer Management</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="text-center">
          <div className="text-3xl font-bold text-blue-600">{stats.totalCustomers}</div>
          <div className="text-gray-600">Total Customers</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-green-600">{stats.totalAssignments}</div>
          <div className="text-gray-600">Active Assignments</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-purple-600">{stats.totalServices}</div>
          <div className="text-gray-600">Service Records</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-orange-600">{stats.expiringThisMonth}</div>
          <div className="text-gray-600">Expiring This Month</div>
        </Card>
      </div>
      
      <Card title="Customer List">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Products</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Services</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {customers.map(customer => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {customer.first_name} {customer.last_name}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{customer.mobile_number}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {customer.vehicle_number} ({customer.vehicle_model})
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      {customer.products?.length || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      {customer.services?.length || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex space-x-2">
                      <Button onClick={() => handleViewDetails(customer)} color="blue" className="text-xs py-1 px-2">
                        View
                      </Button>
                      <Button onClick={() => handleEditCustomer(customer)} color="gray" className="text-xs py-1 px-2">
                        Edit
                      </Button>
                      <Button onClick={() => handleDeleteCustomer(customer.id, customer.first_name)} color="red" className="text-xs py-1 px-2">
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      
      {selectedCustomerId && (
        <Card title={`Customer Details: ${selectedCustomerName}`}>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-700 mb-3">Assigned Products</h3>
                {getCustomerProducts(selectedCustomerId).length > 0 ? (
                  <div className="space-y-2">
                    {getCustomerProducts(selectedCustomerId).map(product => (
                      <div key={product.id} className="p-3 border rounded-lg">
                        <div className="font-medium">{product.product_name}</div>
                        <div className="text-sm text-gray-600">
                          Purchase: {formatDate(product.product_purchase_date)} | 
                          Expiry: {formatDate(product.warranty_expiry_date)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No products assigned</p>
                )}
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-700 mb-3">Service History</h3>
                {getCustomerServices(selectedCustomerId).length > 0 ? (
                  <div className="space-y-2">
                    {getCustomerServices(selectedCustomerId).slice(0, 3).map(service => (
                      <div key={service.id} className="p-3 border rounded-lg">
                        <div className="font-medium">{service.service_type} - {service.service_status}</div>
                        <div className="text-sm text-gray-600">
                          Date: {formatDate(service.service_date)} | 
                          Product: {service.product_name}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No service history</p>
                )}
              </div>
            </div>
            
            <div className="pt-4 border-t">
              <Button onClick={() => setSelectedCustomerId(null)} color="gray">
                Close Details
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

const ProductMaster = () => {
  const { 
    products,
    assignments,
    addItem,
    updateItem,
    deleteItem,
    loading,
    stats
  } = useUnifiedData();
  
  const [formData, setFormData] = useState({
    product_id: '', product_name: '', product_type: '', manufacturer: '',
    warranty_period_months: 12, default_service_cycle_days: 180
  });
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState('');
  
  console.log('Product Master - Total Products:', stats.totalProducts);
  console.log('Product Master - Total Assignments:', stats.totalAssignments);
  
  const handleSave = async (e) => {
    e.preventDefault();
    setMessage('');
    
    try {
      if (!formData.product_id || !formData.product_name || !formData.product_type) {
        setMessage('Please fill all required fields');
        return;
      }
      
      if (isEditing) {
        const result = await updateItem(COLLECTIONS.PRODUCTS, formData.id, formData);
        if (result.success) {
          setMessage('Product updated successfully!');
          resetForm();
        } else {
          setMessage(`Error: ${result.error}`);
        }
      } else {
        const result = await addItem(COLLECTIONS.PRODUCTS, formData);
        if (result.success) {
          setMessage('Product added successfully!');
          resetForm();
        } else {
          setMessage(`Error: ${result.error}`);
        }
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };
  
  const handleEdit = (product) => {
    setFormData(product);
    setIsEditing(true);
  };
  
  const handleDelete = async (id) => {
    if (window.confirm('Delete this product?')) {
      const result = await deleteItem(COLLECTIONS.PRODUCTS, id);
      if (result.success) {
        alert('Product deleted successfully!');
      } else {
        alert(`Error: ${result.error}`);
      }
    }
  };
  
  const resetForm = () => {
    setFormData({
      product_id: '', product_name: '', product_type: '', manufacturer: '',
      warranty_period_months: 12, default_service_cycle_days: 180
    });
    setIsEditing(false);
    setMessage('');
  };
  
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading product data...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6 px-4 md:px-0">
      <h1 className="text-xl md:text-3xl font-bold text-gray-800">Product Master</h1>
      
      {message && (
        <div className={`p-3 rounded-lg ${message.includes('Error') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
          {message}
        </div>
      )}
      
      <Card title={isEditing ? 'Edit Product' : 'Add New Product'}>
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input label="Product ID" name="product_id" value={formData.product_id} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} required />
          <Input label="Product Name" name="product_name" value={formData.product_name} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} required />
          <Input label="Product Type" name="product_type" value={formData.product_type} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} required />
          <Input label="Manufacturer" name="manufacturer" value={formData.manufacturer} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} />
          <Input label="Warranty Period (months)" name="warranty_period_months" value={formData.warranty_period_months} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} required type="number" />
          <Input label="Service Cycle (days)" name="default_service_cycle_days" value={formData.default_service_cycle_days} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="number" />
          
          <div className="md:col-span-3 flex justify-end space-x-3">
            <Button type="submit" color="blue">
              {isEditing ? 'Update Product' : 'Add Product'}
            </Button>
            <Button type="button" onClick={resetForm} color="gray">
              Cancel
            </Button>
          </div>
        </form>
      </Card>
      
      <Card title="Product List">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Warranty</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assignments</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {products.map(product => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">{product.product_id}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{product.product_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{product.product_type}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{product.warranty_period_months} months</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      {product.assignments?.length || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex space-x-2">
                      <Button onClick={() => handleEdit(product)} color="gray" className="text-xs py-1 px-2">
                        Edit
                      </Button>
                      <Button onClick={() => handleDelete(product.id)} color="red" className="text-xs py-1 px-2">
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const ServiceMaster = () => {
  const { 
    services,
    customers,
    products,
    addItem,
    updateItem,
    deleteItem,
    loading,
    stats
  } = useUnifiedData();
  
  const [formData, setFormData] = useState({
    customer_id: '',
    product_id: '',
    service_date: new Date().toISOString().split('T')[0],
    service_type: 'Regular',
    service_status: 'Completed',
    service_notes: '',
    next_service_date: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState('');
  
  console.log('Service Master - Total Services:', stats.totalServices);
  console.log('Service Master - Pending Services:', stats.pendingServices);
  
  const handleSave = async (e) => {
    e.preventDefault();
    setMessage('');
    
    try {
      if (!formData.customer_id || !formData.product_id || !formData.service_date) {
        setMessage('Please fill all required fields');
        return;
      }
      
      if (isEditing) {
        const result = await updateItem(COLLECTIONS.SERVICES, formData.id, formData);
        if (result.success) {
          setMessage('Service record updated successfully!');
          resetForm();
        } else {
          setMessage(`Error: ${result.error}`);
        }
      } else {
        const result = await addItem(COLLECTIONS.SERVICES, formData);
        if (result.success) {
          setMessage('Service record added successfully!');
          resetForm();
        } else {
          setMessage(`Error: ${result.error}`);
        }
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };
  
  const handleEdit = (service) => {
    setFormData(service);
    setIsEditing(true);
  };
  
  const handleDelete = async (id) => {
    if (window.confirm('Delete this service record?')) {
      const result = await deleteItem(COLLECTIONS.SERVICES, id);
      if (result.success) {
        alert('Service record deleted successfully!');
      } else {
        alert(`Error: ${result.error}`);
      }
    }
  };
  
  const resetForm = () => {
    setFormData({
      customer_id: '',
      product_id: '',
      service_date: new Date().toISOString().split('T')[0],
      service_type: 'Regular',
      service_status: 'Completed',
      service_notes: '',
      next_service_date: ''
    });
    setIsEditing(false);
    setMessage('');
  };
  
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading service data...</p>
      </div>
    );
  }
  
  const customerOptions = customers.map(c => ({ 
    value: c.id, 
    label: `${c.first_name} ${c.last_name} (${c.vehicle_number})` 
  }));
  
  const productOptions = products.map(p => ({ 
    value: p.id, 
    label: `${p.product_name} (${p.product_type})` 
  }));
  
  const serviceTypeOptions = [
    { value: 'Regular', label: 'Regular' },
    { value: 'Warranty', label: 'Warranty' },
    { value: 'Complaint', label: 'Complaint' },
    { value: 'Emergency', label: 'Emergency' },
  ];
  
  const serviceStatusOptions = [
    { value: 'Completed', label: 'Completed' },
    { value: 'Pending', label: 'Pending' },
    { value: 'Cancelled', label: 'Cancelled' },
  ];
  
  return (
    <div className="space-y-6 px-4 md:px-0">
      <h1 className="text-xl md:text-3xl font-bold text-gray-800">Service Master</h1>
      
      {message && (
        <div className={`p-3 rounded-lg ${message.includes('Error') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
          {message}
        </div>
      )}
      
      <Card title={isEditing ? 'Edit Service Record' : 'Add New Service Record'}>
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select label="Customer" name="customer_id" value={formData.customer_id} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} options={customerOptions} required />
          <Select label="Product" name="product_id" value={formData.product_id} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} options={productOptions} required />
          <Input label="Service Date" name="service_date" value={formData.service_date} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} required type="date" />
          <Select label="Service Type" name="service_type" value={formData.service_type} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} options={serviceTypeOptions} required />
          <Select label="Service Status" name="service_status" value={formData.service_status} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} options={serviceStatusOptions} required />
          <Input label="Next Service Date" name="next_service_date" value={formData.next_service_date} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} type="date" />
          <div className="md:col-span-3">
            <Input label="Service Notes" name="service_notes" value={formData.service_notes} onChange={(e) => setFormData({...formData, [e.target.name]: e.target.value})} />
          </div>
          
          <div className="md:col-span-3 flex justify-end space-x-3">
            <Button type="submit" color="green">
              {isEditing ? 'Update Service' : 'Record Service'}
            </Button>
            <Button type="button" onClick={resetForm} color="gray">
              Cancel
            </Button>
          </div>
        </form>
      </Card>
      
      <Card title="Service History">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {services.map(service => (
                <tr key={service.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(service.service_date)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{service.customer_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{service.product_name}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{service.service_type}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      service.service_status === 'Completed' ? 'bg-green-100 text-green-800' :
                      service.service_status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {service.service_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex space-x-2">
                      <Button onClick={() => handleEdit(service)} color="gray" className="text-xs py-1 px-2">
                        Edit
                      </Button>
                      <Button onClick={() => handleDelete(service.id)} color="red" className="text-xs py-1 px-2">
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const AdminDashboard = () => {
  const { 
    reminders,
    stats,
    meta,
    updateItem,
    loading
  } = useUnifiedData();
  
  const [filterDays, setFilterDays] = useState(30);
  
  console.log('Dashboard - Expiring this week:', stats.expiringThisWeek);
  console.log('Dashboard - Expiring this month:', stats.expiringThisMonth);
  console.log('Dashboard - Online status:', meta.isOnline);
  
  const handleSendReminder = async (mappingId, customerName) => {
    if (window.confirm(`Send reminder to ${customerName}?`)) {
      const result = await updateItem(COLLECTIONS.MAPPINGS, mappingId, {
        'reminder_status.renewal_sent': true,
        updated_at: new Date().toISOString()
      });
      
      if (result.success) {
        alert(`Reminder sent to ${customerName}`);
      } else {
        alert('Error sending reminder');
      }
    }
  };
  
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading dashboard data...</p>
      </div>
    );
  }
  
  const filteredReminders = reminders.filter(reminder => 
    reminder.days_until_expiry <= filterDays
  );
  
  return (
    <div className="space-y-6 px-4 md:px-0">
      <h1 className="text-xl md:text-3xl font-bold text-gray-800">Admin Dashboard</h1>
      
      {!meta.isOnline && (
        <div className="p-4 bg-yellow-100 text-yellow-800 rounded-lg border border-yellow-300">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>You are offline. Showing cached data.</span>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="text-center">
          <div className="text-3xl font-bold text-blue-600">{stats.totalCustomers}</div>
          <div className="text-gray-600">Total Customers</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-green-600">{stats.totalAssignments}</div>
          <div className="text-gray-600">Active Warranties</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-red-600">{stats.expiringThisWeek}</div>
          <div className="text-gray-600">Expiring This Week</div>
        </Card>
        <Card className="text-center">
          <div className="text-3xl font-bold text-purple-600">{stats.pendingServices}</div>
          <div className="text-gray-600">Pending Services</div>
        </Card>
      </div>
      
      <Card title="Warranty Expiry Reminders">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Reminders for next {filterDays} days</h3>
          <div className="flex space-x-2">
            <Button onClick={() => setFilterDays(7)} color={filterDays === 7 ? 'blue' : 'gray'} className="text-xs">
              7 Days
            </Button>
            <Button onClick={() => setFilterDays(15)} color={filterDays === 15 ? 'blue' : 'gray'} className="text-xs">
              15 Days
            </Button>
            <Button onClick={() => setFilterDays(30)} color={filterDays === 30 ? 'blue' : 'gray'} className="text-xs">
              30 Days
            </Button>
          </div>
        </div>
        
        {filteredReminders.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No warranties expiring in the next {filterDays} days
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expiry Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Left</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReminders.map(reminder => (
                  <tr key={reminder.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div>{reminder.customer_name}</div>
                      <div className="text-xs text-gray-500">{reminder.vehicle_number}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{reminder.product_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(reminder.expiry_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        reminder.days_until_expiry <= 1 ? 'bg-red-100 text-red-800' :
                        reminder.days_until_expiry <= 7 ? 'bg-orange-100 text-orange-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {reminder.days_until_expiry} days
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {reminder.reminder_to_send ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                          Reminder due
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                          Monitoring
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Button 
                        onClick={() => handleSendReminder(reminder.id, reminder.customer_name)}
                        color="blue"
                        className="text-xs py-1 px-2"
                        disabled={!meta.isOnline}
                      >
                        {meta.isOnline ? 'Send Reminder' : 'Offline'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

const ReportsModule = () => {
  const { 
    customers,
    products,
    assignments,
    services,
    logs,
    stats,
    loading,
    meta
  } = useUnifiedData();
  
  const [reportType, setReportType] = useState('customerReport');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  
  console.log('Reports Module - Total Customers:', stats.totalCustomers);
  console.log('Reports Module - Total Services:', stats.totalServices);
  
  const exportToExcel = (data, filename) => {
    if (data.length === 0) {
      alert('No data to export');
      return;
    }
    
    setIsExporting(true);
    
    try {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
      alert('Excel file downloaded successfully!');
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Error exporting to Excel');
    } finally {
      setIsExporting(false);
    }
  };
  
  const getCustomerReportData = () => {
    if (selectedCustomer) {
      const customer = customers.find(c => c.id === selectedCustomer);
      if (!customer) return [];
      
      return [{
        'Customer ID': customer.id,
        'Customer Name': `${customer.first_name} ${customer.last_name}`,
        'Mobile Number': customer.mobile_number,
        'Vehicle Number': customer.vehicle_number,
        'Vehicle Model': customer.vehicle_model,
        'Total Products': customer.products?.length || 0,
        'Total Services': customer.services?.length || 0,
        'City': customer.city,
        'State': customer.state,
        'Address': customer.address
      }];
    }
    
    return customers.map(customer => ({
      'Customer ID': customer.id,
      'Customer Name': `${customer.first_name} ${customer.last_name}`,
      'Mobile Number': customer.mobile_number,
      'Vehicle Number': customer.vehicle_number,
      'Total Products': customer.products?.length || 0,
      'Total Services': customer.services?.length || 0,
      'City': customer.city,
      'State': customer.state
    }));
  };
  
  const getServiceReportData = () => {
    const filteredServices = services.filter(service => {
      const serviceDate = new Date(service.service_date);
      const start = new Date(startDate);
      const end = new Date(endDate);
      return serviceDate >= start && serviceDate <= end;
    });
    
    return filteredServices.map(service => ({
      'Service ID': service.id,
      'Service Date': formatDate(service.service_date),
      'Customer Name': service.customer_name,
      'Vehicle Number': service.vehicle_number,
      'Product Name': service.product_name,
      'Service Type': service.service_type,
      'Service Status': service.service_status,
      'Service Notes': service.service_notes,
      'Next Service Date': formatDate(service.next_service_date)
    }));
  };
  
  const getWarrantyReportData = () => {
    const today = new Date();
    const next30Days = new Date();
    next30Days.setDate(today.getDate() + 30);
    
    return assignments
      .filter(assignment => {
        if (!assignment.warranty_expiry_date) return false;
        const expiryDate = new Date(assignment.warranty_expiry_date);
        return expiryDate >= today && expiryDate <= next30Days;
      })
      .map(assignment => ({
        'Customer Name': assignment.customer_name,
        'Mobile Number': assignment.mobile_number,
        'Vehicle Number': assignment.vehicle_number,
        'Product Name': assignment.product_name,
        'Purchase Date': formatDate(assignment.product_purchase_date),
        'Warranty Period': `${assignment.product_warranty_period} months`,
        'Expiry Date': formatDate(assignment.warranty_expiry_date),
        'Days Left': assignment.days_until_expiry,
        'Status': assignment.is_expired ? 'Expired' : 'Active'
      }));
  };
  
  const getReportData = () => {
    switch (reportType) {
      case 'customerReport':
        return getCustomerReportData();
      case 'serviceReport':
        return getServiceReportData();
      case 'warrantyReport':
        return getWarrantyReportData();
      default:
        return [];
    }
  };
  
  const getReportTitle = () => {
    switch (reportType) {
      case 'customerReport':
        return selectedCustomer ? 'Customer Detail Report' : 'Customer Summary Report';
      case 'serviceReport':
        return 'Service History Report';
      case 'warrantyReport':
        return 'Warranty Expiry Report';
      default:
        return 'Report';
    }
  };
  
  const customerOptions = customers.map(c => ({
    value: c.id,
    label: `${c.first_name} ${c.last_name} (${c.vehicle_number})`
  }));
  
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading report data...</p>
      </div>
    );
  }
  
  const reportData = getReportData();
  
  return (
    <div className="space-y-6 px-4 md:px-0">
      <h1 className="text-xl md:text-3xl font-bold text-gray-800">Reports Center</h1>
      
      {!meta.isOnline && (
        <div className="p-4 bg-yellow-100 text-yellow-800 rounded-lg border border-yellow-300">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>You are offline. Reports may not include latest data.</span>
          </div>
        </div>
      )}
      
      <Card title="Report Configuration">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-700 mb-3">Report Type</h3>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="reportType"
                  value="customerReport"
                  checked={reportType === 'customerReport'}
                  onChange={(e) => setReportType(e.target.value)}
                  className="h-4 w-4 text-blue-600"
                />
                <span>Customer Report</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="reportType"
                  value="serviceReport"
                  checked={reportType === 'serviceReport'}
                  onChange={(e) => setReportType(e.target.value)}
                  className="h-4 w-4 text-blue-600"
                />
                <span>Service History Report</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="reportType"
                  value="warrantyReport"
                  checked={reportType === 'warrantyReport'}
                  onChange={(e) => setReportType(e.target.value)}
                  className="h-4 w-4 text-blue-600"
                />
                <span>Warranty Expiry Report</span>
              </label>
            </div>
          </div>
          
          <div>
            {reportType === 'customerReport' && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-3">Customer Selection</h3>
                <Select
                  label="Select Customer (Optional)"
                  name="selectedCustomer"
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  options={[{ value: '', label: 'All Customers' }, ...customerOptions]}
                />
                <p className="text-sm text-gray-500 mt-2">
                  Leave empty for all customers report
                </p>
              </div>
            )}
            
            {reportType === 'serviceReport' && (
              <div>
                <h3 className="font-semibold text-gray-700 mb-3">Date Range</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Start Date"
                    name="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                  <Input
                    label="End Date"
                    name="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
      
      <Card title={`${getReportTitle()} - ${reportData.length} Records`}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold">{getReportTitle()}</h3>
            <p className="text-sm text-gray-600">
              Generated on: {new Date().toLocaleDateString()}
            </p>
          </div>
          <Button
            onClick={() => exportToExcel(reportData, getReportTitle())}
            color="green"
            disabled={reportData.length === 0 || isExporting || !meta.isOnline}
          >
            {isExporting ? 'Exporting...' : 'Export to Excel'}
          </Button>
        </div>
        
        {reportData.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No data found for the selected report criteria
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(reportData[0]).map((key, index) => (
                    <th key={index} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reportData.slice(0, 10).map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50">
                    {Object.values(row).map((value, colIndex) => (
                      <td key={colIndex} className="px-4 py-3 whitespace-nowrap text-sm">
                        {value || 'N/A'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            
            {reportData.length > 10 && (
              <div className="mt-4 text-center text-sm text-gray-600">
                Showing first 10 of {reportData.length} records. Export to see all records.
              </div>
            )}
          </div>
        )}
      </Card>
      
      <Card title="Quick Statistics">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{stats.totalCustomers}</div>
            <div className="text-sm text-gray-600">Total Customers</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{stats.totalServices}</div>
            <div className="text-sm text-gray-600">Service Records</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{stats.expiringThisMonth}</div>
            <div className="text-sm text-gray-600">Expiring This Month</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">{stats.pendingServices}</div>
            <div className="text-sm text-gray-600">Pending Services</div>
          </div>
        </div>
      </Card>
    </div>
  );
};

const ErrorBoundary = ({ children }) => {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);

  const handleCatch = (error, errorInfo) => {
    console.error("Error in component:", error, errorInfo);
    setError(error);
    setErrorInfo(errorInfo);
    setHasError(true);
    
    try {
      const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');
      errors.push({
        timestamp: new Date().toISOString(),
        error: error.toString(),
        errorInfo: errorInfo.componentStack
      });
      localStorage.setItem('app_errors', JSON.stringify(errors.slice(-10)));
    } catch (e) {
      console.error('Error saving error log:', e);
    }
  };

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg max-w-md w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-red-600 mb-2">Application Error</h2>
            <p className="text-gray-600 mb-4">Sorry, something went wrong</p>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">Error Message:</p>
            <code className="text-xs text-red-500 break-words">
              {error?.toString()}
            </code>
          </div>
          
          <div className="flex flex-col space-y-3">
            <button 
              onClick={() => window.location.reload()}
              className="bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 font-medium transition duration-150"
            >
              Reload Application
            </button>
            <button 
              onClick={() => {
                localStorage.removeItem('unified_data_cache');
                localStorage.removeItem('app_errors');
                window.location.reload();
              }}
              className="bg-gray-200 text-gray-800 px-4 py-3 rounded-lg hover:bg-gray-300 font-medium transition duration-150"
            >
              Clear Cache and Reload
            </button>
          </div>
          
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              If problem persists, please contact support
            </p>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

const App = () => {
  const [currentView, setCurrentView] = useState('Dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const renderContent = () => {
    switch (currentView) {
      case 'Sales':
        return <SalesAssignment />;
      case 'Customers':
        return <CustomerManagement />;
      case 'Products':
        return <ProductMaster />;
      case 'Services':
        return <ServiceMaster />;
      case 'Reports':
        return <ReportsModule />;
      case 'Dashboard':
      default:
        return <AdminDashboard />;
    }
  };

  const NavItem = ({ view, children }) => (
    <Button 
      onClick={() => { 
        setCurrentView(view); 
        setIsMobileMenuOpen(false); 
      }} 
      color={currentView === view ? 'blue' : 'gray'}
      className="w-full md:w-auto justify-center"
    >
      {children}
    </Button>
  );

  return (
    <UnifiedDataProvider>
      <ErrorBoundary>
        <div className="min-h-screen bg-gray-50 font-sans antialiased flex flex-col">
          <header className="bg-white shadow-md sticky top-0 z-20">
            <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
              <div className="text-xl md:text-2xl font-bold text-blue-800 flex items-center">
                <svg className="w-5 h-5 md:w-6 md:h-6 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                </svg>
                Umiya Tank Testing Plant
              </div>
              
              <div className="hidden md:flex items-center mr-4">
                <div className={`flex items-center ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                  <div className={`w-2 h-2 rounded-full mr-2 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm font-medium">
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
              
              <nav className="hidden md:flex space-x-2">
                <NavItem view="Dashboard">Dashboard</NavItem>
                <NavItem view="Sales">Sales</NavItem>
                <NavItem view="Customers">Customers</NavItem>
                <NavItem view="Products">Products</NavItem>
                <NavItem view="Services">Services</NavItem>
                <NavItem view="Reports">Reports</NavItem>
              </nav>

              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 relative"
              >
                {!isOnline && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white"></div>
                )}
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  {isMobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
            
            {isMobileMenuOpen && (
              <div className="md:hidden bg-white border-t shadow-lg">
                <div className="px-4 py-3">
                  <div className="mb-3 p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className={`flex items-center ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                        <div className={`w-2 h-2 rounded-full mr-2 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-sm font-medium">
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <NavItem view="Dashboard">Dashboard</NavItem>
                    <NavItem view="Sales">Sales</NavItem>
                    <NavItem view="Customers">Customers</NavItem>
                    <NavItem view="Products">Products</NavItem>
                    <NavItem view="Services">Services</NavItem>
                    <NavItem view="Reports">Reports</NavItem>
                  </div>
                </div>
              </div>
            )}
          </header>

          <main className="max-w-7xl mx-auto py-4 md:py-8 px-2 sm:px-4 md:px-6 lg:px-8 w-full flex-grow">
            {renderContent()}
          </main>

          <footer className="w-full bg-gray-800 text-white text-center p-3 md:p-4 text-xs mt-8">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
              <p>CNG Kit ERP - Warranty & Service Management System</p>
              <div className="mt-2 md:mt-0 flex items-center space-x-2">
                <span>Status:</span>
                <div className={`flex items-center ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
                  <div className={`w-2 h-2 rounded-full mr-1 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-xs">
                    {isOnline ? 'Connected' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </ErrorBoundary>
    </UnifiedDataProvider>
  );
};

export default App;
