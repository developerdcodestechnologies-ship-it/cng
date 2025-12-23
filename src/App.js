import React, { useState, useEffect, useMemo, createContext, useContext } from 'react';
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

// Firebase configuration
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

// 啟用離線持久化
enableIndexedDbPersistence(db, { cacheSizeBytes: CACHE_SIZE_UNLIMITED })
  .then(() => {
    console.log("Firebase 離線持久化已啟用");
  })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("多個標籤頁已開啟，離線持久化只能在一個標籤頁中使用");
    } else if (err.code === 'unimplemented') {
      console.warn("瀏覽器不支持離線持久化");
    }
  });

// Firebase collections
const COLLECTIONS = {
  CUSTOMERS: 'customers',
  PRODUCTS: 'products',
  MAPPINGS: 'mappings',
  SERVICES: 'services',
  LOGS: 'logs'
};

// 創建全局數據緩存上下文
const FirebaseDataContext = createContext();

export const FirebaseDataProvider = ({ children }) => {
    const [dataCache, setDataCache] = useState(() => {
        // 從 localStorage 初始化緩存
        const savedCache = localStorage.getItem('firebase_data_cache');
        return savedCache ? JSON.parse(savedCache) : {};
    });
    
    // 保存緩存到 localStorage
    useEffect(() => {
        try {
            localStorage.setItem('firebase_data_cache', JSON.stringify(dataCache));
        } catch (error) {
            console.error('Error saving cache to localStorage:', error);
        }
    }, [dataCache]);

    const updateCache = (collectionName, data) => {
        setDataCache(prev => ({
            ...prev,
            [collectionName]: {
                data,
                timestamp: Date.now(),
                version: '1.0'
            }
        }));
    };

    const getCache = (collectionName) => {
        const cache = dataCache[collectionName];
        if (cache && cache.timestamp) {
            // 檢查緩存是否過期（5分鐘）
            const isExpired = Date.now() - cache.timestamp > 5 * 60 * 1000;
            if (!isExpired) {
                return cache.data || [];
            }
        }
        return [];
    };

    const clearCache = () => {
        setDataCache({});
        localStorage.removeItem('firebase_data_cache');
    };

    return (
        <FirebaseDataContext.Provider value={{ dataCache, updateCache, getCache, clearCache }}>
            {children}
        </FirebaseDataContext.Provider>
    );
};

export const useFirebaseDataContext = () => useContext(FirebaseDataContext);

// 錯誤邊界組件
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }
    
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    
    componentDidCatch(error, errorInfo) {
        console.error("Error in component:", error, errorInfo);
        this.setState({ errorInfo });
        
        // 保存錯誤到 localStorage 供調試
        try {
            const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');
            errors.push({
                timestamp: new Date().toISOString(),
                error: error.toString(),
                errorInfo: errorInfo.componentStack
            });
            localStorage.setItem('app_errors', JSON.stringify(errors.slice(-10))); // 只保留最近10個錯誤
        } catch (e) {
            console.error('Error saving error log:', e);
        }
    }
    
    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        window.location.reload();
    };
    
    handleClearCache = () => {
        try {
            localStorage.removeItem('firebase_data_cache');
            localStorage.removeItem('app_errors');
            this.handleRetry();
        } catch (error) {
            console.error('Error clearing cache:', error);
        }
    };
    
    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                    <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg max-w-md w-full">
                        <div className="text-center mb-6">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <h2 className="text-xl md:text-2xl font-bold text-red-600 mb-2">應用程序錯誤</h2>
                            <p className="text-gray-600 mb-4">抱歉，發生了一些問題</p>
                        </div>
                        
                        <div className="bg-gray-50 p-4 rounded-lg mb-6">
                            <p className="text-sm font-medium text-gray-700 mb-2">錯誤信息:</p>
                            <code className="text-xs text-red-500 break-words">
                                {this.state.error?.toString()}
                            </code>
                        </div>
                        
                        <div className="flex flex-col space-y-3">
                            <button 
                                onClick={this.handleRetry}
                                className="bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 font-medium transition duration-150"
                            >
                                重新加載應用程序
                            </button>
                            <button 
                                onClick={this.handleClearCache}
                                className="bg-gray-200 text-gray-800 px-4 py-3 rounded-lg hover:bg-gray-300 font-medium transition duration-150"
                            >
                                清除緩存並重新加載
                            </button>
                        </div>
                        
                        <div className="mt-6 text-center">
                            <p className="text-xs text-gray-500">
                                如果問題持續存在，請聯繫技術支持
                            </p>
                        </div>
                    </div>
                </div>
            );
        }
        
        return this.props.children;
    }
}

// Helper functions for date calculations and formatting
const calculateReminderDate = (expiryDate, daysBefore) => {
    if (!expiryDate) return null;
    const date = new Date(expiryDate);
    date.setDate(date.getDate() - parseInt(daysBefore, 10));
    return date.toISOString().split('T')[0];
};

const calculateExpiryDate = (purchaseDate, warrantyMonths) => {
    if (!purchaseDate || !warrantyMonths) return null;
    const date = new Date(purchaseDate);
    date.setMonth(date.getMonth() + parseInt(warrantyMonths, 10));
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
};

const calculateNextServiceDate = (serviceDate, cycleDays) => {
    if (!serviceDate || !cycleDays) return null;
    const date = new Date(serviceDate);
    date.setDate(date.getDate() + parseInt(cycleDays, 10));
    return date.toISOString().split('T')[0];
};

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    // 檢查是否為 Firestore 時間戳
    if (dateString.toDate) {
        return dateString.toDate().toLocaleDateString('en-GB');
    }
    
    try {
        return new Date(dateString).toLocaleDateString('en-GB');
    } catch (error) {
        return 'Invalid Date';
    }
};

// --- UTILITY COMPONENTS ---

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

// --- COMPONENT DEFINITIONS ---

const initialCustomerData = {
    first_name: '', last_name: '', mobile_number: '', whatsapp_number: '',
    address: '', city: '', state: '', vehicle_number: '', vehicle_model: ''
};

const initialMappingData = {
    product_id: '',
    product_purchase_date: new Date().toISOString().split('T')[0],
    product_fitting_date: '',
    product_warranty_period: 12,
    warranty_expiry_date: '',
    reminder_status: {
        rem_1_sent: false,
        rem_2_sent: false,
        rem_3_sent: false,
        renewal_sent: false,
        warranty_renewed: false
    },
    notes: ''
};

// Responsive Table Component
const ResponsiveTable = ({ columns, data, title }) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (isMobile) {
        return (
            <div className="space-y-4">
                {data.map((row, rowIndex) => (
                    <div key={rowIndex} className="bg-white p-4 rounded-lg shadow border border-gray-200">
                        {columns.map((col, colIndex) => (
                            <div key={colIndex} className="mb-2 last:mb-0">
                                <div className="text-xs font-medium text-gray-500 uppercase">{col.label}:</div>
                                 <div className="text-sm text-gray-900 break-words">{row[col.key] || 'N/A'}</div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        {columns.map((col, index) => (
                            <th key={index} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {data.map((row, rowIndex) => (
                        <tr key={rowIndex} className="hover:bg-gray-50">
                            {columns.map((col, colIndex) => (
                                <td key={colIndex} className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                    {row[col.key] || 'N/A'}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// 增強版的 Firebase CRUD Operations
const useFirebaseData = (collectionName) => {
    const [data, setData] = useState(() => {
        // 從 localStorage 加載緩存數據
        try {
            const cacheKey = `fb_cache_${collectionName}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                // 檢查緩存是否過期（10分鐘）
                if (Date.now() - parsed.timestamp < 10 * 60 * 1000) {
                    console.log(`Loaded ${collectionName} from cache:`, parsed.data.length, 'items');
                    return parsed.data;
                }
            }
        } catch (error) {
            console.error('Error loading from cache:', error);
        }
        return [];
    });
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retryCount, setRetryCount] = useState(0);

    const saveToCache = (dataToCache) => {
        try {
            const cacheKey = `fb_cache_${collectionName}`;
            const cacheData = {
                data: dataToCache,
                timestamp: Date.now(),
                collection: collectionName
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (error) {
            console.error('Error saving to cache:', error);
        }
    };

    const loadData = async () => {
        try {
            console.log(`Loading ${collectionName} from Firebase...`);
            const snapshot = await getDocs(collection(db, collectionName));
            const dataList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            setData(dataList);
            saveToCache(dataList);
            setLoading(false);
            setError(null);
            console.log(`Loaded ${collectionName} from Firebase:`, dataList.length, 'items');
        } catch (err) {
            console.error(`Error loading ${collectionName}:`, err);
            
            // 如果 Firebase 失敗，使用緩存數據
            if (data.length > 0) {
                console.log(`Using cached data for ${collectionName}`);
                setLoading(false);
            } else {
                setError(`Failed to load ${collectionName}: ${err.message}`);
                setLoading(false);
                
                // 自動重試機制
                if (retryCount < 3) {
                    setTimeout(() => {
                        setRetryCount(prev => prev + 1);
                    }, 2000 * (retryCount + 1));
                }
            }
        }
    };

    useEffect(() => {
        // 首次加載
        loadData();
        
        // 設置實時監聽器
        console.log(`Setting up real-time listener for ${collectionName}`);
        
        const unsubscribe = onSnapshot(
            collection(db, collectionName),
            (snapshot) => {
                console.log(`${collectionName} real-time update received:`, snapshot.docs.length, 'documents');
                const dataList = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                setData(dataList);
                saveToCache(dataList);
                setLoading(false);
                setError(null);
            },
            (err) => {
                console.error(`Error in ${collectionName} listener:`, err);
                setError(`Connection error for ${collectionName}: ${err.message}`);
                
                // 不停止加載狀態，保持緩存數據顯示
                setLoading(false);
            }
        );

        return () => {
            console.log(`Cleaning up listener for ${collectionName}`);
            unsubscribe();
        };
    }, [collectionName, retryCount]);

    const addItem = async (item) => {
        try {
            console.log(`Adding item to ${collectionName}:`, item);
            const docRef = await addDoc(collection(db, collectionName), {
                ...item,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });
            
            console.log(`Item added with ID: ${docRef.id}`);
            
            // 更新本地緩存
            const newItem = { id: docRef.id, ...item };
            setData(prev => [...prev, newItem]);
            saveToCache([...data, newItem]);
            
            return { success: true, id: docRef.id };
        } catch (err) {
            console.error(`Error adding to ${collectionName}:`, err);
            
            // 如果離線，添加到本地隊列
            if (err.code === 'unavailable') {
                try {
                    const offlineQueue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
                    offlineQueue.push({
                        collection: collectionName,
                        action: 'add',
                        data: item,
                        timestamp: Date.now()
                    });
                    localStorage.setItem('offline_queue', JSON.stringify(offlineQueue));
                    
                    // 更新本地狀態
                    const tempId = `offline_${Date.now()}`;
                    const newItem = { id: tempId, ...item };
                    setData(prev => [...prev, newItem]);
                    saveToCache([...data, newItem]);
                    
                    return { success: true, id: tempId, offline: true };
                } catch (e) {
                    console.error('Error saving to offline queue:', e);
                }
            }
            
            return { success: false, error: err.message };
        }
    };

    const updateItem = async (id, item) => {
        try {
            console.log(`Updating item in ${collectionName}:`, id, item);
            const docRef = doc(db, collectionName, id);
            await updateDoc(docRef, {
                ...item,
                updated_at: serverTimestamp()
            });
            
            // 更新本地緩存
            setData(prev => prev.map(d => d.id === id ? { ...d, ...item } : d));
            saveToCache(data.map(d => d.id === id ? { ...d, ...item } : d));
            
            return { success: true };
        } catch (err) {
            console.error(`Error updating ${collectionName}:`, err);
            
            // 如果離線，添加到本地隊列
            if (err.code === 'unavailable') {
                try {
                    const offlineQueue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
                    offlineQueue.push({
                        collection: collectionName,
                        action: 'update',
                        id: id,
                        data: item,
                        timestamp: Date.now()
                    });
                    localStorage.setItem('offline_queue', JSON.stringify(offlineQueue));
                    
                    // 更新本地狀態
                    setData(prev => prev.map(d => d.id === id ? { ...d, ...item } : d));
                    saveToCache(data.map(d => d.id === id ? { ...d, ...item } : d));
                    
                    return { success: true, offline: true };
                } catch (e) {
                    console.error('Error saving to offline queue:', e);
                }
            }
            
            return { success: false, error: err.message };
        }
    };

    const deleteItem = async (id) => {
        try {
            console.log(`Deleting item from ${collectionName}:`, id);
            const docRef = doc(db, collectionName, id);
            await deleteDoc(docRef);
            
            // 更新本地緩存
            setData(prev => prev.filter(d => d.id !== id));
            saveToCache(data.filter(d => d.id !== id));
            
            return { success: true };
        } catch (err) {
            console.error(`Error deleting from ${collectionName}:`, err);
            
            // 如果離線，添加到本地隊列
            if (err.code === 'unavailable') {
                try {
                    const offlineQueue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
                    offlineQueue.push({
                        collection: collectionName,
                        action: 'delete',
                        id: id,
                        timestamp: Date.now()
                    });
                    localStorage.setItem('offline_queue', JSON.stringify(offlineQueue));
                    
                    // 更新本地狀態
                    setData(prev => prev.filter(d => d.id !== id));
                    saveToCache(data.filter(d => d.id !== id));
                    
                    return { success: true, offline: true };
                } catch (e) {
                    console.error('Error saving to offline queue:', e);
                }
            }
            
            return { success: false, error: err.message };
        }
    };

    const retryConnection = () => {
        setLoading(true);
        setRetryCount(prev => prev + 1);
        loadData();
    };

    return { 
        data, 
        loading, 
        error, 
        addItem, 
        updateItem, 
        deleteItem, 
        retryConnection,
        retryCount 
    };
};

// 1. CONSOLIDATED SALES ASSIGNMENT VIEW
const SalesAssignment = () => {
    const [customerType, setCustomerType] = useState('new');
    const [customerData, setCustomerData] = useState(initialCustomerData);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [mappingData, setMappingData] = useState(initialMappingData);
    const [message, setMessage] = useState('');
    const [renewalConfirmation, setRenewalConfirmation] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const { data: allCustomers, loading: customersLoading, error: customersError } = useFirebaseData(COLLECTIONS.CUSTOMERS);
    const { data: allProducts, loading: productsLoading, error: productsError } = useFirebaseData(COLLECTIONS.PRODUCTS);
    const { data: allMappings, loading: mappingsLoading } = useFirebaseData(COLLECTIONS.MAPPINGS);

    // 檢查連接狀態
    const isOnline = navigator.onLine;

    useEffect(() => {
        console.log('SalesAssignment - Connection status:', isOnline ? 'Online' : 'Offline');
        console.log('SalesAssignment - Customers:', allCustomers.length);
        console.log('SalesAssignment - Products:', allProducts.length);
        console.log('SalesAssignment - Mappings:', allMappings.length);
        
        if (customersError) console.error('Customers error:', customersError);
        if (productsError) console.error('Products error:', productsError);
    }, [allCustomers, allProducts, allMappings, customersError, productsError, isOnline]);

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
            const selectedProduct = allProducts.find(p => p.id === value);
            if (selectedProduct) {
                newMappingData.product_warranty_period = selectedProduct.warranty_period_months;
            }
        }
        setMappingData(newMappingData);
    };

    const handleSaveAssignment = async (e) => {
        e.preventDefault();
        
        if (!isOnline) {
            setMessage('Warning: You are offline. Data will be saved locally and synced when connection is restored.');
        }
        
        setMessage('');
        setRenewalConfirmation(null);
        setIsSubmitting(true);

        let finalCustomerId = selectedCustomerId;
        let logAction = 'Product Assignment';
        let customerName = '';

        try {
            console.log('Starting save assignment...');
            
            if (customerType === 'new') {
                // Validate customer data
                if (!customerData.first_name || !customerData.mobile_number || !customerData.vehicle_number) {
                    setMessage('Error: Please fill all required customer fields.');
                    setIsSubmitting(false);
                    return;
                }
                
                // Create new customer
                const newCustomer = {
                    ...customerData,
                    created_at: serverTimestamp(),
                    updated_at: serverTimestamp()
                };
                
                console.log('Adding new customer:', newCustomer);
                const result = await addDoc(collection(db, COLLECTIONS.CUSTOMERS), newCustomer);
                
                if (result.offline) {
                    finalCustomerId = result.id;
                    customerName = customerData.first_name;
                    logAction = 'New Customer & Product Assignment (Offline)';
                    console.log('New customer saved offline with ID:', finalCustomerId);
                } else {
                    finalCustomerId = result.id;
                    customerName = customerData.first_name;
                    logAction = 'New Customer & Product Assignment';
                    console.log('New customer created with ID:', finalCustomerId);
                }
            } else {
                if (!selectedCustomerId) {
                    setMessage('Error: Please select an existing customer.');
                    setIsSubmitting(false);
                    return;
                }
                const existingCustomer = allCustomers.find(c => c.id === selectedCustomerId);
                if (!existingCustomer) {
                    setMessage('Error: Selected customer not found.');
                    setIsSubmitting(false);
                    return;
                }
                customerName = existingCustomer.first_name || 'Existing Customer';
                logAction = 'Warranty Renewal';
                mappingData.reminder_status.warranty_renewed = true;
            }

            // Validate mapping data
            if (!mappingData.product_id || !mappingData.product_purchase_date || !mappingData.product_warranty_period) {
                setMessage('Error: Please fill all required product fields.');
                setIsSubmitting(false);
                return;
            }

            const calculatedExpiryDate = calculateExpiryDate(mappingData.product_purchase_date, mappingData.product_warranty_period);

            // Save mapping
            const mappingToSave = {
                customer_id: finalCustomerId,
                product_id: mappingData.product_id,
                product_purchase_date: mappingData.product_purchase_date,
                product_fitting_date: mappingData.product_fitting_date || '',
                product_warranty_period: mappingData.product_warranty_period,
                warranty_expiry_date: calculatedExpiryDate,
                reminder_status: mappingData.reminder_status,
                notes: mappingData.notes || '',
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            };

            console.log('Saving mapping:', mappingToSave);
            const mappingResult = await addDoc(collection(db, COLLECTIONS.MAPPINGS), mappingToSave);
            
            if (mappingResult.offline) {
                console.log('Mapping saved offline');
            }

            // Save log
            const logToSave = {
                customer_id: finalCustomerId,
                action: logAction,
                date: new Date().toISOString(),
                notes: mappingData.notes || `${logAction} completed`,
                product_id: mappingData.product_id,
                log_type: 'Warranty/Sales',
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            };
            
            console.log('Saving log:', logToSave);
            await addDoc(collection(db, COLLECTIONS.LOGS), logToSave);

            if (customerType === 'existing') {
                setRenewalConfirmation({
                    customerName: customerName,
                    renewalDate: formatDate(new Date().toISOString()),
                    newExpiryDate: formatDate(calculatedExpiryDate)
                });
            }

            const successMessage = isOnline 
                ? `Success! ${customerName}'s assignment/renewal saved.`
                : `Success! ${customerName}'s assignment/renewal saved offline and will sync when connection is restored.`;
            
            setMessage(successMessage);
            resetForm();

        } catch (error) {
            console.error("Error saving sales assignment:", error);
            setMessage(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setCustomerData(initialCustomerData);
        setSelectedCustomerId('');
        setMappingData({
            ...initialMappingData,
            product_purchase_date: new Date().toISOString().split('T')[0]
        });
    };

    const productOptions = allProducts.map(p => ({ 
        value: p.id, 
        label: `${p.product_name || 'N/A'} (${p.product_type || 'N/A'} - ${p.warranty_period_months || 12}M)` 
    }));
    
    const customerOptions = allCustomers.map(c => ({ 
        value: c.id, 
        label: `${c.first_name || ''} ${c.last_name || ''} (${c.vehicle_number || 'N/A'})` 
    }));

    if (customersLoading || productsLoading || mappingsLoading) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading data...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="px-4 md:px-0">
                <h1 className="text-xl md:text-3xl font-bold text-gray-800">New Sales Assignment (Customer & Warranty Setup)</h1>
                {!isOnline && (
                    <div className="mt-2 p-3 bg-yellow-100 text-yellow-800 rounded-lg flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        You are currently offline. Data will be saved locally and synced when connection is restored.
                    </div>
                )}
            </div>

            {message && (
                <div className={`p-4 rounded-lg font-medium mx-4 md:mx-0 ${
                    message.startsWith('Success') ? 'bg-green-100 text-green-800' : 
                    message.startsWith('Warning') ? 'bg-yellow-100 text-yellow-800' : 
                    'bg-red-100 text-red-800'
                }`}>
                    {message}
                </div>
            )}
            
            {renewalConfirmation && (
                 <Card title="Renewal Confirmation Message (Auto-Sent)" className="mx-4 md:mx-0">
                    <p className="text-gray-700 text-sm md:text-base">The following message was automatically sent to the customer via WhatsApp/SMS:</p>
                    <div className="mt-3 p-4 bg-yellow-50 border border-yellow-300 rounded-lg font-mono text-xs md:text-sm">
                        <p>Hello {renewalConfirmation.customerName},</p>
                        <p>Your CNG Kit warranty has been successfully **Renewed** on **{renewalConfirmation.renewalDate}**.</p>
                        <p>Your new warranty expiry date is **{renewalConfirmation.newExpiryDate}**.</p>
                        <p>Thank you for choosing our service!</p>
                    </div>
                </Card>
            )}

            <form onSubmit={handleSaveAssignment} className="space-y-6 px-4 md:px-0">
                <Card title="Customer Identification" className="!p-4">
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
                            <span className="text-gray-700 font-medium text-sm md:text-base">New Customer</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="radio"
                                name="customerType"
                                value="existing"
                                checked={customerType === 'existing'}
                                onChange={() => { setCustomerType('existing'); setCustomerData(initialCustomerData); }}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                            />
                            <span className="text-gray-700 font-medium text-sm md:text-base">Existing Customer / Renewal</span>
                        </label>
                    </div>
                </Card>

                <Card title={customerType === 'new' ? "1. New Customer Details" : "1. Select Existing Customer"} className="!p-4">
                    {customerType === 'new' ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                            <Input label="First Name" name="first_name" value={customerData.first_name} onChange={handleCustomerChange} required />
                            <Input label="Last Name" name="last_name" value={customerData.last_name} onChange={handleCustomerChange} required />
                            <Input label="Mobile Number" name="mobile_number" value={customerData.mobile_number} onChange={handleCustomerChange} required type="tel" placeholder="+919876543210" />
                            
                            <Input label="Vehicle Number" name="vehicle_number" value={customerData.vehicle_number} onChange={handleCustomerChange} required />
                            <Input label="Vehicle Model" name="vehicle_model" value={customerData.vehicle_model} onChange={handleCustomerChange} required />
                            <Input label="WhatsApp Number" name="whatsapp_number" value={customerData.whatsapp_number} onChange={handleCustomerChange} type="tel" />
                            
                            <Input label="City" name="city" value={customerData.city} onChange={handleCustomerChange} />
                            <Input label="State" name="state" value={customerData.state} onChange={handleCustomerChange} />
                            <div className="md:col-span-3">
                                <Input label="Address" name="address" value={customerData.address} onChange={handleCustomerChange} />
                            </div>
                        </div>
                    ) : (
                        <Select
                            label="Search and Select Customer"
                            name="selected_customer_id"
                            value={selectedCustomerId}
                            onChange={(e) => setSelectedCustomerId(e.target.value)}
                            options={customerOptions}
                            required
                        />
                    )}
                </Card>

                <Card title="2. Product Assignment & Warranty Setup" className="!p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
                        <Select label="Product Kit Model" name="product_id" value={mappingData.product_id} onChange={handleMappingChange} options={productOptions} required />
                        
                        <Input label="Purchase Date" name="product_purchase_date" value={mappingData.product_purchase_date} onChange={handleMappingChange} required type="date" />
                        
                        <Input label="Fitting Date (Optional)" name="product_fitting_date" value={mappingData.product_fitting_date} onChange={handleMappingChange} type="date" />

                        <Input label="Warranty Period (Months)" name="product_warranty_period" value={mappingData.product_warranty_period} onChange={handleMappingChange} required type="number" min="1" />

                        <div className="md:col-span-2">
                            <Input label="Warranty Expiry Date (Auto)" name="warranty_expiry_date" value={formatDate(mappingData.warranty_expiry_date)} disabled />
                        </div>
                        <div className="md:col-span-2">
                            <Input label="Next Reminder(s)" name="next_warranty_reminder_date" value="Calculated by cron logic" disabled />
                        </div>

                        <div className="md:col-span-4">
                            <Input label="Notes / Remarks (Log Entry)" name="notes" value={mappingData.notes} onChange={handleMappingChange} />
                        </div>
                    </div>
                </Card>

                <div className="flex flex-col md:flex-row justify-center space-y-3 md:space-y-0 md:space-x-4 pt-4 px-4 md:px-0">
                    <Button 
                        type="submit" 
                        color="blue" 
                        className="w-full md:w-64 py-3 text-base md:text-lg font-bold"
                        disabled={(customerType === 'existing' && !selectedCustomerId) || isSubmitting}
                    >
                        {isSubmitting ? (
                            <div className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                                Saving...
                            </div>
                        ) : (
                            `Save ${customerType === 'new' ? 'New Customer' : 'Renewal'}`
                        )}
                    </Button>
                    <Button type="button" onClick={resetForm} color="gray" className="w-full md:w-32 py-3 text-base md:text-lg" disabled={isSubmitting}>
                        Clear Form
                    </Button>
                </div>
            </form>
            
            <CustomerProductMappingList />
        </div>
    );
};

// 7. Customer Product Mapping List
const CustomerProductMappingList = () => {
    const { data: allCustomers, loading: customersLoading, error: customersError } = useFirebaseData(COLLECTIONS.CUSTOMERS);
    const { data: allProducts, loading: productsLoading, error: productsError } = useFirebaseData(COLLECTIONS.PRODUCTS);
    const { data: allMappings, loading: mappingsLoading } = useFirebaseData(COLLECTIONS.MAPPINGS);
    
    useEffect(() => {
        console.log('CustomerProductMappingList - Customers:', allCustomers.length);
        console.log('CustomerProductMappingList - Products:', allProducts.length);
        console.log('CustomerProductMappingList - Mappings:', allMappings.length);
        
        if (customersError) console.error('Customers error:', customersError);
        if (productsError) console.error('Products error:', productsError);
    }, [allCustomers, allProducts, allMappings, customersError, productsError]);
    
    const mergedMappings = useMemo(() => {
        console.log('Merging mappings...');
        const merged = allMappings.map(m => {
            const customer = allCustomers.find(c => c.id === m.customer_id) || {};
            const product = allProducts.find(p => p.id === m.product_id) || {};
            return { ...m, customer, product };
        });
        console.log('Merged mappings:', merged.length);
        return merged;
    }, [allMappings, allCustomers, allProducts]);

    const tableColumns = [
        { label: 'Customer', key: 'customer' },
        { label: 'Product', key: 'product' },
        { label: 'Purchase Date', key: 'purchase_date' },
        { label: 'Warranty (M)', key: 'warranty' },
        { label: 'Expiry Date', key: 'expiry_date' },
        { label: 'Renewal Status', key: 'renewal_status' }
    ];

    const tableData = mergedMappings.map(m => ({
        customer: m.customer ? `${m.customer.first_name || ''} ${m.customer.last_name || ''} (${m.customer.vehicle_number || 'N/A'})` : 'N/A',
        product: m.product ? m.product.product_name : 'N/A',
        purchase_date: formatDate(m.product_purchase_date),
        warranty: m.product_warranty_period,
        expiry_date: formatDate(m.warranty_expiry_date),
        renewal_status: m.reminder_status?.warranty_renewed ? 'Renewed' : 'Active'
    }));

    if (customersLoading || productsLoading || mappingsLoading) {
        return (
            <Card title="Current Product Assignments & Warranties" className="mx-4 md:mx-0">
                <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">Loading assignments...</p>
                </div>
            </Card>
        );
    }

    return (
        <Card title="Current Product Assignments & Warranties" className="mx-4 md:mx-0">
            <div className="mb-4 text-sm text-gray-600">
                Total Assignments: {tableData.length}
            </div>
            {tableData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    No assignments found. Add a new sales assignment to see data here.
                </div>
            ) : (
                <ResponsiveTable columns={tableColumns} data={tableData} />
            )}
        </Card>
    );
};

// 2. Product Master
const ProductMaster = () => {
    const [formData, setFormData] = useState({
        product_id: '', product_name: '', product_type: '', manufacturer: '',
        warranty_period_months: 12, default_service_cycle_days: 180
    });
    const [isEditing, setIsEditing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const { data: products, loading, addItem, updateItem, deleteItem } = useFirebaseData(COLLECTIONS.PRODUCTS);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        
        try {
            if (!formData.product_id || !formData.product_name || !formData.product_type) {
                alert('Please fill all required fields');
                setIsSubmitting(false);
                return;
            }

            const productToSave = {
                ...formData,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            };

            if (isEditing) {
                const result = await updateItem(formData.id, productToSave);
                if (!result.success) throw new Error(result.error);
                alert('Product updated successfully!');
            } else {
                const result = await addItem(productToSave);
                if (!result.success) throw new Error(result.error);
                alert('Product added successfully!');
            }
            resetForm();
        } catch (error) {
            console.error("Error saving product:", error);
            alert(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (product) => {
        setFormData(product);
        setIsEditing(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this product?')) {
            try {
                const result = await deleteItem(id);
                if (!result.success) throw new Error(result.error);
                alert('Product deleted successfully!');
            } catch (error) {
                console.error("Error deleting product:", error);
                alert(`Error: ${error.message}`);
            }
        }
    };

    const resetForm = () => {
        setFormData({
            product_id: '', product_name: '', product_type: '', manufacturer: '',
            warranty_period_months: 12, default_service_cycle_days: 180
        });
        setIsEditing(false);
    };

    if (loading) return <div className="text-center py-8">Loading Product Data...</div>;

    const productColumns = [
        { label: 'ID', key: 'product_id' },
        { label: 'Name / Type', key: 'product_name_type' },
        { label: 'Manufacturer', key: 'manufacturer' },
        { label: 'Warranty (M)', key: 'warranty' },
        { label: 'Service Cycle (D)', key: 'service_cycle' },
        { label: 'Actions', key: 'actions' }
    ];

    const productData = products.map(p => ({
        product_id: p.product_id,
        product_name_type: `${p.product_name} / ${p.product_type}`,
        manufacturer: p.manufacturer,
        warranty: p.warranty_period_months,
        service_cycle: p.default_service_cycle_days,
        actions: (
            <div className="flex space-x-2">
                <Button onClick={() => handleEdit(p)} color="gray" className="text-xs py-1 px-2">Edit</Button>
                <Button onClick={() => handleDelete(p.id)} color="red" className="text-xs py-1 px-2">Delete</Button>
            </div>
        )
    }));

    return (
        <div className="space-y-6 px-4 md:px-0">
            <h1 className="text-xl md:text-3xl font-bold text-gray-800">Product Master</h1>
            
            <Card title={isEditing ? 'Edit Product' : 'Add New Product'} className="!p-4">
                <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                    <Input label="Product ID" name="product_id" value={formData.product_id} onChange={handleChange} required />
                    <Input label="Product Name" name="product_name" value={formData.product_name} onChange={handleChange} required />
                    <Input label="Product Type" name="product_type" value={formData.product_type} onChange={handleChange} required />
                    <Input label="Manufacturer" name="manufacturer" value={formData.manufacturer} onChange={handleChange} />
                    <Input label="Warranty Period (months)" name="warranty_period_months" value={formData.warranty_period_months} onChange={handleChange} required type="number" min="1" />
                    <Input label="Default Service Cycle (days)" name="default_service_cycle_days" value={formData.default_service_cycle_days} onChange={handleChange} type="number" min="1" />
                    <div className="md:col-span-3 flex flex-col md:flex-row justify-end space-y-2 md:space-y-0 md:space-x-3">
                        <Button type="submit" color="blue" className="w-full md:w-auto" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : isEditing ? 'Update Product' : 'Add Product'}
                        </Button>
                        <Button type="button" onClick={resetForm} color="gray" className="w-full md:w-auto">Cancel</Button>
                    </div>
                </form>
            </Card>

            <Card title="Product List" className="!p-4">
                <div className="mb-4 text-sm text-gray-600">
                    Total Products: {productData.length}
                </div>
                <ResponsiveTable columns={productColumns} data={productData} />
            </Card>
        </div>
    );
};

// 4. Service Master
const ServiceMaster = () => {
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const { data: allCustomers, loading: customersLoading } = useFirebaseData(COLLECTIONS.CUSTOMERS);
    const { data: allProducts, loading: productsLoading } = useFirebaseData(COLLECTIONS.PRODUCTS);
    const { data: services, loading: servicesLoading, addItem, updateItem, deleteItem } = useFirebaseData(COLLECTIONS.SERVICES);

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

    const handleChange = (e) => {
        const { name, value } = e.target;
        let newFormData = { ...formData, [name]: value };

        if (name === 'product_id' || name === 'service_date') {
            const productId = name === 'product_id' ? value : newFormData.product_id;
            const serviceDate = name === 'service_date' ? value : newFormData.service_date;

            const selectedProduct = allProducts.find(p => p.id === productId);
            const cycleDays = selectedProduct?.default_service_cycle_days || 0;

            const nextServiceDate = calculateNextServiceDate(serviceDate, cycleDays);
            
            newFormData = { ...newFormData, next_service_date: nextServiceDate };
        }
        
        setFormData(newFormData);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        
        try {
            if (!formData.customer_id || !formData.product_id || !formData.service_date) {
                alert('Please fill all required fields');
                setIsSubmitting(false);
                return;
            }

            const serviceToSave = {
                ...formData,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            };

            if (isEditing) {
                const result = await updateItem(formData.id, serviceToSave);
                if (!result.success) throw new Error(result.error);
                alert('Service record updated successfully!');
            } else {
                const result = await addItem(serviceToSave);
                if (!result.success) throw new Error(result.error);
                
                // Add log entry
                await addDoc(collection(db, COLLECTIONS.LOGS), {
                    customer_id: formData.customer_id,
                    action: 'Service Record',
                    date: new Date().toISOString(),
                    notes: formData.service_notes || `${formData.service_type} service completed`,
                    product_id: formData.product_id,
                    log_type: 'Service',
                    created_at: serverTimestamp(),
                    updated_at: serverTimestamp()
                });
                
                alert('Service record added successfully!');
            }
            resetForm();
        } catch (error) {
            console.error("Error saving service record:", error);
            alert(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (service) => {
        setFormData(service);
        setIsEditing(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this service record?')) {
            try {
                const result = await deleteItem(id);
                if (!result.success) throw new Error(result.error);
                alert('Service record deleted successfully!');
            } catch (error) {
                console.error("Error deleting service record:", error);
                alert(`Error: ${error.message}`);
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
    };
    
    const customerOptions = allCustomers.map(c => ({ value: c.id, label: `${c.first_name} ${c.last_name} (${c.vehicle_number})` }));
    const productOptions = allProducts.map(p => ({ value: p.id, label: `${p.product_name} (${p.product_type})` }));

    const mergedServices = useMemo(() => {
        return services.map(s => {
            const customer = allCustomers.find(c => c.id === s.customer_id) || {};
            const product = allProducts.find(p => p.id === s.product_id) || {};
            return { ...s, customer, product };
        });
    }, [services, allCustomers, allProducts]);

    const serviceColumns = [
        { label: 'Customer', key: 'customer' },
        { label: 'Product', key: 'product' },
        { label: 'Type', key: 'type' },
        { label: 'Date', key: 'date' },
        { label: 'Status', key: 'status' },
        { label: 'Next Service', key: 'next_service' },
        { label: 'Actions', key: 'actions' }
    ];

    const serviceData = mergedServices.map(s => ({
        customer: s.customer ? `${s.customer.first_name} (${s.customer.vehicle_number})` : 'N/A',
        product: s.product ? s.product.product_name : 'N/A',
        type: s.service_type,
        date: formatDate(s.service_date),
        status: s.service_status,
        next_service: formatDate(s.next_service_date),
        actions: (
            <div className="flex space-x-2">
                <Button onClick={() => handleEdit(s)} color="gray" className="text-xs py-1 px-2">Edit</Button>
                <Button onClick={() => handleDelete(s.id)} color="red" className="text-xs py-1 px-2">Delete</Button>
            </div>
        )
    }));

    if (customersLoading || productsLoading || servicesLoading) {
        return <div className="text-center py-8">Loading Service Data...</div>;
    }

    return (
        <div className="space-y-6 px-4 md:px-0">
            <h1 className="text-xl md:text-3xl font-bold text-gray-800">Service Master</h1>
            
            <Card title={isEditing ? 'Edit Service Record' : 'Add New Service Record'} className="!p-4">
                <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                    <Select label="Customer" name="customer_id" value={formData.customer_id} onChange={handleChange} options={customerOptions} required />
                    <Select label="Product Serviced" name="product_id" value={formData.product_id} onChange={handleChange} options={productOptions} required />

                    <Input label="Service Date" name="service_date" value={formData.service_date} onChange={handleChange} required type="date" />
                    
                    <Select label="Service Type" name="service_type" value={formData.service_type} onChange={handleChange} options={serviceTypeOptions} required />
                    <Select label="Service Status" name="service_status" value={formData.service_status} onChange={handleChange} options={serviceStatusOptions} required />

                    <Input label="Next Service Date (Auto)" name="next_service_date" value={formData.next_service_date} disabled />

                    <div className="md:col-span-3">
                        <Input label="Service Notes" name="service_notes" value={formData.service_notes} onChange={handleChange} />
                    </div>
                    
                    <div className="md:col-span-3 flex flex-col md:flex-row justify-end space-y-2 md:space-y-0 md:space-x-3">
                        <Button type="submit" color="green" className="w-full md:w-auto" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : isEditing ? 'Update Service' : 'Record Service'}
                        </Button>
                        <Button type="button" onClick={resetForm} color="gray" className="w-full md:w-auto">Cancel</Button>
                    </div>
                </form>
            </Card>

            <Card title="Service History List" className="!p-4">
                <div className="mb-4 text-sm text-gray-600">
                    Total Service Records: {serviceData.length}
                </div>
                <ResponsiveTable columns={serviceColumns} data={serviceData} />
            </Card>
        </div>
    );
};

// 5. Admin Dashboard / Notification Panel
const AdminDashboard = () => {
    const [filterDays, setFilterDays] = useState(30);
    const [today, setToday] = useState('');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    
    const { data: allCustomers, loading: customersLoading } = useFirebaseData(COLLECTIONS.CUSTOMERS);
    const { data: allProducts, loading: productsLoading } = useFirebaseData(COLLECTIONS.PRODUCTS);
    const { data: allMappings, loading: mappingsLoading } = useFirebaseData(COLLECTIONS.MAPPINGS);

    // 監聽網絡狀態
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

    // Reminder Tiers (Days before Expiry)
    const REMINDER_TIERS = useMemo(() => ([
        { days: 30, label: '1st Reminder (30 Days)', key: 'rem_1_sent' },
        { days: 15, label: '2nd Reminder (15 Days)', key: 'rem_2_sent' },
        { days: 1, label: 'Final Reminder (1 Day)', key: 'rem_3_sent' },
    ]), []);

    useEffect(() => {
        setToday(new Date().toISOString().split('T')[0]);
    }, []);

    // Function to determine which reminder is due today, if any
    const getDueReminder = (mapping, today) => {
        if (mapping.reminder_status?.warranty_renewed) {
            return { due: false, message: 'Warranty Renewed. Reminders stopped.', tier: null };
        }
        
        const expiryDate = mapping.warranty_expiry_date;
        if (!expiryDate) return { due: false };

        const todayTimestamp = new Date(today).getTime();

        for (const tier of REMINDER_TIERS) {
            const reminderDate = calculateReminderDate(expiryDate, tier.days);
            const reminderTimestamp = new Date(reminderDate).getTime();
            
            // Check if today is the exact reminder day AND the reminder hasn't been sent
            if (reminderTimestamp === todayTimestamp && !mapping.reminder_status?.[tier.key]) {
                 const customer = allCustomers.find(c => c.id === mapping.customer_id) || {};
                 const message = `Hello ${customer.first_name}, ${tier.label} alert: Your CNG Kit warranty is expiring on ${formatDate(expiryDate)}. Please contact us for inspection/service.`;
                 return { 
                     due: true, 
                     message, 
                     tier 
                 };
            }
        }

        return { due: false };
    };

    // Function to mark reminder as sent
    const handleSendReminder = async (mappingId, reminderKey, customerName) => {
        try {
            // Update the mapping to mark reminder as sent
            const mappingRef = doc(db, COLLECTIONS.MAPPINGS, mappingId);
            await updateDoc(mappingRef, {
                [`reminder_status.${reminderKey}`]: true,
                updated_at: serverTimestamp()
            });

            // Add log entry
            await addDoc(collection(db, COLLECTIONS.LOGS), {
                customer_id: mappingId,
                action: `Reminder Sent: ${reminderKey}`,
                date: new Date().toISOString(),
                notes: `Reminder sent to ${customerName}`,
                log_type: 'Reminder',
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            });

            alert(`Reminder sent to ${customerName}`);
        } catch (error) {
            console.error("Error sending reminder:", error);
            alert('Error sending reminder');
        }
    };

    // Filter Mappings for Warranty Expiry Logic
    const remindersQueue = useMemo(() => {
        if (!allMappings || !today) return [];

        const todayTimestamp = new Date(today).getTime();
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + filterDays);
        const futureTimestamp = futureDate.getTime();

        const queue = [];

        allMappings.forEach(m => {
            const customer = allCustomers.find(c => c.id === m.customer_id) || {};
            const product = allProducts.find(p => p.id === m.product_id) || {};
            const expiryDate = m.warranty_expiry_date;

            if (!expiryDate) return;

            // 1. Check for Renewal Confirmation status
            if (m.reminder_status?.renewal_sent) {
                queue.push({
                    id: m.id,
                    customerName: `${customer.first_name} ${customer.last_name}`,
                    vehicleNumber: customer.vehicle_number,
                    expiryDate: expiryDate,
                    status: 'Renewal Sent',
                    details: `Warranty successfully renewed on ${formatDate(m.created_at)}.`
                });
                return;
            }
            
            // 2. Check for overdue and unsent reminders (Cron Job Simulation)
            let isDue = false;
            let dueReminder = null;
            let lastSent = 'None';
            
            // Identify if any reminder is due today
            const check = getDueReminder(m, today);

            if (check.due) {
                isDue = true;
                dueReminder = check.tier;
            }

            // Determine the next upcoming reminder day for dashboard filtering
            let daysUntilNextReminder = Infinity;
            for (const tier of REMINDER_TIERS) {
                 const reminderDate = calculateReminderDate(expiryDate, tier.days);
                 const reminderTimestamp = new Date(reminderDate).getTime();
                 
                 if (reminderTimestamp >= todayTimestamp && reminderTimestamp <= futureTimestamp && !m.reminder_status?.[tier.key] && !m.reminder_status?.warranty_renewed) {
                    const daysAway = Math.ceil((reminderTimestamp - todayTimestamp) / (1000 * 60 * 60 * 24));
                    if (daysAway >= 0 && daysAway < daysUntilNextReminder) {
                        daysUntilNextReminder = daysAway;
                    }
                 }
                 if(m.reminder_status?.[tier.key]) {
                    lastSent = tier.label;
                 }
            }
            
            // Push to queue if a reminder is due today OR if an un-renewed warranty is expiring within the filter period.
            if (isDue || daysUntilNextReminder < Infinity) {
                 const daysUntilExpiry = Math.ceil((new Date(expiryDate).getTime() - todayTimestamp) / (1000 * 60 * 60 * 24));
                 
                 queue.push({
                    id: m.id,
                    customerName: `${customer.first_name} ${customer.last_name}`,
                    vehicleNumber: customer.vehicle_number,
                    expiryDate: expiryDate,
                    daysUntilExpiry: daysUntilExpiry,
                    daysUntilNextReminder: daysUntilNextReminder === Infinity ? 'N/A' : daysUntilNextReminder,
                    status: isDue ? `DUE: ${dueReminder.label}` : 'Pending',
                    lastSent: lastSent,
                    mockMessage: isDue ? check.message : 'No reminder due today.',
                    reminderKey: isDue ? dueReminder.key : null
                 });
            }
        });

        // Filter out Renewal Sent items if they fall outside the 30-day view
        return queue.filter(item => {
            if(item.status === 'Renewal Sent') {
                return true; // Keep renewal logs visible
            }
            const expiryTimestamp = new Date(item.expiryDate).getTime();
            return expiryTimestamp >= todayTimestamp && expiryTimestamp <= futureTimestamp;
        }).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

    }, [allMappings, allCustomers, allProducts, today, filterDays, REMINDER_TIERS]);

    if (customersLoading || productsLoading || mappingsLoading) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading Dashboard Data...</p>
            </div>
        );
    }

    const dashboardColumns = [
        { label: 'Customer', key: 'customer' },
        { label: 'Vehicle', key: 'vehicle' },
        { label: 'Expiry Date', key: 'expiry_date' },
        { label: 'Days Left', key: 'days_left' },
        { label: 'Status', key: 'status' },
        { label: 'Last Sent', key: 'last_sent' },
        { label: 'Cron Action', key: 'action' }
    ];

    const dashboardData = remindersQueue.map(m => ({
        customer: m.customerName,
        vehicle: m.vehicleNumber,
        expiry_date: formatDate(m.expiryDate),
        days_left: m.daysUntilExpiry,
        status: m.status,
        last_sent: m.lastSent,
        action: m.mockMessage || m.details,
        reminderKey: m.reminderKey,
        mappingId: m.id
    }));

    return (
        <div className="space-y-6 px-4 md:px-0">
            <h1 className="text-xl md:text-3xl font-bold text-gray-800">Admin Dashboard & Tiered Reminders</h1>
            
            {!isOnline && (
                <div className="p-4 bg-yellow-100 text-yellow-800 rounded-lg border border-yellow-300">
                    <div className="flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span>You are currently offline. Displaying cached data.</span>
                    </div>
                </div>
            )}

            <Card title="Warranty Expiry Reminder Queue (Cron Simulation)" className="!p-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 p-2 bg-blue-50 rounded-lg space-y-2 md:space-y-0">
                    <h3 className="text-base md:text-lg font-semibold text-blue-800">Reminders Due or Expiring (Next {filterDays} Days)</h3>
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => setFilterDays(7)} color={filterDays === 7 ? 'blue' : 'gray'} className="text-xs py-1 px-2">7 Days</Button>
                        <Button onClick={() => setFilterDays(15)} color={filterDays === 15 ? 'blue' : 'gray'} className="text-xs py-1 px-2">15 Days</Button>
                        <Button onClick={() => setFilterDays(30)} color={filterDays === 30 ? 'blue' : 'gray'} className="text-xs py-1 px-2">30 Days</Button>
                    </div>
                </div>

                {remindersQueue.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">No tiered reminders are due within the next {filterDays} days, or all warranties have been renewed.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    {dashboardColumns.map((col, index) => (
                                        <th key={index} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            {col.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {dashboardData.map((row, rowIndex) => (
                                    <tr key={rowIndex} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{row.customer}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{row.vehicle}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{row.expiry_date}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{row.days_left}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                                            <span className={`font-medium ${
                                                row.status.includes('DUE') ? 'text-red-600' : 
                                                row.status.includes('Renewal') ? 'text-green-600' : 
                                                'text-orange-600'
                                            }`}>
                                                {row.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{row.last_sent}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                                            <div className="flex flex-col space-y-1">
                                                <span className="text-gray-700">{row.action}</span>
                                                {row.reminderKey && (
                                                    <Button 
                                                        onClick={() => handleSendReminder(row.mappingId, row.reminderKey, row.customer)}
                                                        color="blue"
                                                        className="text-xs py-1 px-2"
                                                        disabled={!isOnline}
                                                    >
                                                        {isOnline ? 'Mark as Sent' : 'Offline - Try Later'}
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                
                <div className="mt-4 text-sm text-gray-600 p-2 border-t pt-3 text-xs md:text-sm">
                    <p className="font-semibold mb-1">**CRON LOGIC:**</p>
                    <ul className="space-y-1">
                        <li><span className="font-semibold text-red-700">DUE</span>: Reminder due today - triggers SMS/WA API call.</li>
                        <li><span className="font-semibold text-green-700">Renewal Sent</span>: Customer renewed - stops all future reminders.</li>
                        <li><span className="font-semibold text-orange-700">Pending</span>: Warranty expiring soon, but no reminder due today.</li>
                    </ul>
                </div>
            </Card>
        </div>
    );
};

// 8. CUSTOMER LOGS MODAL COMPONENT
const CustomerLogsModal = ({ customerId, customerName, onClose }) => {
    const { data: allProducts, loading: productsLoading } = useFirebaseData(COLLECTIONS.PRODUCTS);
    const { data: allLogs, loading: logsLoading } = useFirebaseData(COLLECTIONS.LOGS);
    
    const logs = useMemo(() => {
        if (!customerId || !allLogs) return [];
        return allLogs
            .filter(log => log.customer_id === customerId)
            .sort((a, b) => {
                const dateA = a.date ? new Date(a.date).getTime() : 0;
                const dateB = b.date ? new Date(b.date).getTime() : 0;
                return dateB - dateA;
            });
    }, [customerId, allLogs]);
    
    const getProductName = (id) => allProducts.find(p => p.id === id)?.product_name || 'N/A';
    
    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        
        let htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Customer Logs - ${customerName}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    h1 { color: #333; border-bottom: 2px solid #2980b9; padding-bottom: 10px; }
                    .log-item { border: 1px solid #ddd; padding: 10px; margin: 10px 0; border-radius: 5px; }
                    .log-date { color: #666; font-size: 12px; }
                    .log-action { font-weight: bold; color: #2980b9; }
                    .log-notes { color: #555; margin-top: 5px; }
                    .log-product { color: #27ae60; font-size: 14px; }
                </style>
            </head>
            <body>
                <h1>Activity Log: ${customerName}</h1>
                <p>Generated on: ${new Date().toLocaleString()}</p>
                <p>Total Logs: ${logs.length}</p>
                <hr>
        `;
        
        logs.forEach(log => {
            htmlContent += `
                <div class="log-item">
                    <div class="log-date">${formatDate(log.date)}</div>
                    <div class="log-action">${log.action}</div>
                    <div class="log-product">Product: ${getProductName(log.product_id)}</div>
                    <div class="log-notes">${log.notes || 'No specific notes'}</div>
                </div>
            `;
        });
        
        htmlContent += `
            </body>
            </html>
        `;
        
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.print();
    };
    
    if (productsLoading || logsLoading) {
        return (
            <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center">
                <div className="bg-white p-6 rounded-lg shadow-xl">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">Loading logs...</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-2 md:p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col mx-2 md:mx-0">
                <div className="p-4 md:p-6 border-b flex flex-col md:flex-row justify-between items-start md:items-center space-y-2 md:space-y-0">
                    <h3 className="text-lg md:text-2xl font-bold text-gray-800 truncate">Activity Log: {customerName}</h3>
                    <div className="flex space-x-2">
                         <Button onClick={handlePrint} color="gray" className="text-xs md:text-sm py-1 px-2 md:px-3">
                            <svg className="w-3 h-3 md:w-4 md:h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m0 0v2a2 2 0 002 2h2a2 2 0 002-2v-2m4 2h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m0 0v2a2 2 0 002 2h2a2 2 0 002-2v-2m4-10H5a2 2 0 00-2 2v4a2 2 0 002 2h2"></path></svg>
                            Print
                        </Button>
                        <Button onClick={onClose} color="gray" className="p-1 md:p-2">
                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </Button>
                    </div>
                </div>
                
                <div className="p-4 md:p-6 overflow-y-auto space-y-3 md:space-y-4">
                    {logs.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 border border-dashed rounded-lg">No activity logs found for this customer.</div>
                    ) : (
                        <div className="space-y-3 md:space-y-4">
                            {logs.map(log => (
                                <div key={log.id} className="p-3 md:p-4 border border-gray-200 rounded-lg shadow-sm bg-gray-50">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-2 mb-2 space-y-1 md:space-y-0">
                                        <span className={`font-semibold text-base md:text-lg ${
                                            log.action.includes('Renewal') ? 'text-green-700' : 
                                            log.action.includes('Service') ? 'text-blue-700' :
                                            log.action.includes('Reminder') ? 'text-orange-700' :
                                            'text-purple-700'
                                        }`}>
                                            {log.action}
                                        </span>
                                        <span className="text-xs md:text-sm text-gray-500">
                                            Date: <span className="font-medium">{formatDate(log.date)}</span>
                                        </span>
                                    </div>
                                    <p className="text-xs md:text-sm text-gray-700 mb-2">
                                        <span className="font-medium">Product:</span> {getProductName(log.product_id) || 'N/A'}
                                    </p>
                                    <p className="text-xs md:text-sm italic text-gray-600">
                                        <span className="font-medium">Notes:</span> {log.notes || 'No specific notes recorded.'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="p-4 border-t flex justify-end">
                    <Button onClick={onClose} color="blue" className="w-full md:w-auto">Close</Button>
                </div>
            </div>
        </div>
    );
};

// 6. CUSTOMER MANAGEMENT VIEW
const CustomerManagementView = () => {
    const [selectedLogCustomerId, setSelectedLogCustomerId] = useState(null);
    const [selectedCustomerName, setSelectedCustomerName] = useState('');
    const [showCustomerForm, setShowCustomerForm] = useState(false);
    const [formData, setFormData] = useState(initialCustomerData);
    const [isEditing, setIsEditing] = useState(false);
    const [formMessage, setFormMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const { data: customers, loading: customersLoading, addItem, updateItem, deleteItem } = useFirebaseData(COLLECTIONS.CUSTOMERS);
    const { data: allProducts } = useFirebaseData(COLLECTIONS.PRODUCTS);
    const { data: allLogs } = useFirebaseData(COLLECTIONS.LOGS);

    const handleCustomerChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSaveCustomer = async (e) => {
        e.preventDefault();
        setFormMessage('');
        setIsSubmitting(true);
        
        try {
            if (!formData.first_name || !formData.mobile_number || !formData.vehicle_number) {
                setFormMessage('Error: Please fill all required fields (First Name, Mobile Number, Vehicle Number)');
                setIsSubmitting(false);
                return;
            }

            const customerToSave = {
                ...formData,
                created_at: serverTimestamp(),
                updated_at: serverTimestamp()
            };

            if (isEditing) {
                const result = await updateItem(formData.id, customerToSave);
                if (!result.success) throw new Error(result.error);
                setFormMessage(`Success! Customer ${formData.first_name} updated successfully.`);
            } else {
                const result = await addItem(customerToSave);
                if (!result.success) throw new Error(result.error);
                setFormMessage(`Success! New customer ${formData.first_name} created. ID: ${result.id}`);
            }
            
            resetForm();
            
        } catch (error) {
            console.error("Error saving customer:", error);
            setFormMessage(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setFormData(initialCustomerData);
        setIsEditing(false);
        setShowCustomerForm(false);
    };

    const handleViewLogs = (customer) => {
        setSelectedLogCustomerId(customer.id);
        setSelectedCustomerName(`${customer.first_name} ${customer.last_name}`);
    };

    const handleCloseLogs = () => {
        setSelectedLogCustomerId(null);
        setSelectedCustomerName('');
    };
    
    const handleEditCustomer = (customer) => {
        setFormData({ ...customer });
        setIsEditing(true);
        setShowCustomerForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteCustomer = async (id, name) => {
        if(window.confirm(`Are you sure you want to delete customer ${name}? This action is irreversible!`)) {
            try {
                const result = await deleteItem(id);
                if (!result.success) throw new Error(result.error);
                alert(`Customer ${name} deleted successfully!`);
            } catch (error) {
                console.error("Error deleting customer:", error);
                alert(`Error: ${error.message}`);
            }
        }
    };

    if (customersLoading) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading customer data...</p>
            </div>
        );
    }

    const customerColumns = [
        { label: 'ID', key: 'id' },
        { label: 'Name', key: 'name' },
        { label: 'Mobile', key: 'mobile' },
        { label: 'Vehicle', key: 'vehicle' },
        { label: 'Actions', key: 'actions' }
    ];

    const customerData = customers.map(c => ({
        id: c.id.substring(0, 6),
        name: `${c.first_name} ${c.last_name}`,
        mobile: c.mobile_number,
        vehicle: `${c.vehicle_number} (${c.vehicle_model})`,
        actions: (
            <div className="flex flex-col md:flex-row space-y-1 md:space-y-0 md:space-x-2">
                <Button onClick={() => handleViewLogs(c)} color="blue" className="text-xs py-1 px-2 w-full md:w-auto">View Logs</Button>
                <Button onClick={() => handleEditCustomer(c)} color="gray" className="text-xs py-1 px-2 w-full md:w-auto">Edit</Button>
                <Button onClick={() => handleDeleteCustomer(c.id, c.first_name)} color="red" className="text-xs py-1 px-2 w-full md:w-auto">Delete</Button>
            </div>
        )
    }));

    return (
        <div className="space-y-6 px-4 md:px-0">
            <h1 className="text-xl md:text-3xl font-bold text-gray-800">Customer Management & Logs</h1>
            
            {/* Customer Form Section */}
            {showCustomerForm && (
                <Card title={isEditing ? 'Edit Customer' : 'Add New Customer'} className="!p-4">
                    {formMessage && (
                        <div className={`p-3 rounded-lg mb-4 font-medium text-sm md:text-base ${
                            formMessage.startsWith('Success') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                            {formMessage}
                        </div>
                    )}
                    
                    <form onSubmit={handleSaveCustomer}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                            <Input label="First Name" name="first_name" value={formData.first_name} onChange={handleCustomerChange} required />
                            <Input label="Last Name" name="last_name" value={formData.last_name} onChange={handleCustomerChange} required />
                            <Input label="Mobile Number" name="mobile_number" value={formData.mobile_number} onChange={handleCustomerChange} required type="tel" placeholder="+919876543210" />
                            
                            <Input label="Vehicle Number" name="vehicle_number" value={formData.vehicle_number} onChange={handleCustomerChange} required />
                            <Input label="Vehicle Model" name="vehicle_model" value={formData.vehicle_model} onChange={handleCustomerChange} required />
                            <Input label="WhatsApp Number" name="whatsapp_number" value={formData.whatsapp_number} onChange={handleCustomerChange} type="tel" />
                            
                            <Input label="City" name="city" value={formData.city} onChange={handleCustomerChange} />
                            <Input label="State" name="state" value={formData.state} onChange={handleCustomerChange} />
                            
                            <div className="md:col-span-3">
                                <Input label="Address" name="address" value={formData.address} onChange={handleCustomerChange} />
                            </div>
                        </div>
                        
                        <div className="flex flex-col md:flex-row justify-end space-y-2 md:space-y-0 md:space-x-3 mt-6">
                            <Button type="submit" color="blue" className="w-full md:w-auto" disabled={isSubmitting}>
                                {isSubmitting ? 'Saving...' : isEditing ? 'Update Customer' : 'Save Customer'}
                            </Button>
                            <Button type="button" onClick={resetForm} color="gray" className="w-full md:w-auto">
                                Cancel
                            </Button>
                        </div>
                    </form>
                </Card>
            )}
            
            {/* Action Buttons */}
            <div className="flex justify-between items-center">
                <div></div>
                <Button 
                    onClick={() => {
                        resetForm();
                        setShowCustomerForm(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }} 
                    color="blue"
                    className="w-full md:w-auto"
                >
                    + Add New Customer
                </Button>
            </div>

            {/* Customer List */}
            <Card title="Existing Customer List" className="!p-4">
                <p className="text-sm text-gray-500 mb-4">Total Customers: {customers.length}</p>
                <ResponsiveTable columns={customerColumns} data={customerData} />
            </Card>

            {/* Log Modal */}
            {selectedLogCustomerId && (
                <CustomerLogsModal
                    customerId={selectedLogCustomerId}
                    customerName={selectedCustomerName}
                    onClose={handleCloseLogs}
                />
            )}
        </div>
    );
};

// 9. NEW REPORTING MODULE
const ReportingModule = () => {
    const today = new Date().toISOString().split('T')[0];
    const [reportType, setReportType] = useState('ServiceHistory');
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [isExporting, setIsExporting] = useState(false);

    const { data: allCustomers, loading: customersLoading } = useFirebaseData(COLLECTIONS.CUSTOMERS);
    const { data: allProducts, loading: productsLoading } = useFirebaseData(COLLECTIONS.PRODUCTS);
    const { data: allMappings, loading: mappingsLoading } = useFirebaseData(COLLECTIONS.MAPPINGS);
    const { data: allServices, loading: servicesLoading } = useFirebaseData(COLLECTIONS.SERVICES);
    const { data: allLogs, loading: logsLoading } = useFirebaseData(COLLECTIONS.LOGS);

    const customerOptions = allCustomers.map(c => ({ value: c.id, label: `${c.first_name} ${c.last_name} (${c.vehicle_number})` }));
    
    const setDateRange = (type) => {
        const start = new Date(today);
        const end = new Date(today);
        
        if (type === 'Daily') {
            // start = today, end = today
        } else if (type === 'Weekly') {
            start.setDate(start.getDate() - 7);
        } else if (type === 'Monthly') {
            start.setMonth(start.getMonth() - 1);
        }

        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
    };
    
    // Excel Export Function
    const exportToExcel = (data, filename, headers) => {
        if (data.length === 0) {
            alert('No data available to export.');
            return;
        }

        setIsExporting(true);
        
        try {
            const wsData = [];
            wsData.push(headers.map(h => h.label));
            data.forEach(row => {
                wsData.push(headers.map(header => row[header.key] || ''));
            });
            
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Report');
            
            XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
            
            alert(`Excel file "${filename}.xlsx" downloaded successfully!`);
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            alert('Error exporting to Excel. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    // PDF Export Function
    const exportToPDF = (data, filename, headers) => {
        if (data.length === 0) {
            alert('No data available to export.');
            return;
        }

        setIsExporting(true);
        
        try {
            let htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${filename}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        h1 { color: #333; }
                        .report-info { margin-bottom: 20px; color: #666; }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        th { background-color: #2980b9; color: white; padding: 8px; text-align: left; }
                        td { padding: 6px; border: 1px solid #ddd; }
                        tr:nth-child(even) { background-color: #f9f9f9; }
                    </style>
                </head>
                <body>
                    <h1>${filename}</h1>
                    <div class="report-info">
                        Generated on: ${new Date().toLocaleDateString()}<br>
                        Total Records: ${data.length}
                    </div>
                    <table>
                        <thead>
                            <tr>
                                ${headers.map(h => `<th>${h.label}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(row => `
                                <tr>
                                    ${headers.map(h => `<td>${row[h.key] || ''}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </body>
                </html>
            `;
            
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${filename}_${new Date().toISOString().split('T')[0]}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert(`Report saved as HTML file "${filename}.html". You can print it as PDF from your browser.`);
        } catch (error) {
            console.error('Error exporting to PDF:', error);
            alert('Error exporting to PDF. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    // Print Function
    const handlePrint = (data, filename, headers) => {
        if (data.length === 0) {
            alert('No data available to print.');
            return;
        }

        const printWindow = window.open('', '_blank');
        
        let htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>${filename}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    h1 { color: #333; }
                    .report-info { margin-bottom: 20px; color: #666; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th { background-color: #2980b9; color: white; padding: 8px; text-align: left; }
                    td { padding: 6px; border: 1px solid #ddd; }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                    @media print {
                        body { margin: 0; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <h1>${filename}</h1>
                <div class="report-info">
                    Generated on: ${new Date().toLocaleDateString()}<br>
                    Total Records: ${data.length}
                </div>
                <button class="no-print" onclick="window.print()" style="padding: 8px 16px; background: #2980b9; color: white; border: none; cursor: pointer; margin-bottom: 10px;">
                    Print Report
                </button>
                <table>
                    <thead>
                        <tr>
                            ${headers.map(h => `<th>${h.label}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(row => `
                            <tr>
                                ${headers.map(h => `<td>${row[h.key] || ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `;
        
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        printWindow.onload = function() {
            printWindow.print();
            printWindow.onafterprint = function() {
                printWindow.close();
            };
        };
    };

    // --- Filtered System Data ---
    const systemReportData = useMemo(() => {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime() + (24 * 60 * 60 * 1000);

        let data = [];
        let columns = [];

        if (reportType === 'ServiceHistory') {
            data = allServices.filter(s => {
                const serviceTime = new Date(s.service_date).getTime();
                return serviceTime >= start && serviceTime <= end;
            }).map(s => {
                const customer = allCustomers.find(c => c.id === s.customer_id) || {};
                const product = allProducts.find(p => p.id === s.product_id) || {};
                return {
                    service_date: formatDate(s.service_date),
                    customer: `${customer.first_name} ${customer.last_name}`,
                    vehicle_number: customer.vehicle_number || 'N/A',
                    product: product.product_name || 'N/A',
                    product_type: product.product_type || 'N/A',
                    service_type: s.service_type,
                    service_status: s.service_status,
                    next_service_date: formatDate(s.next_service_date),
                    service_notes: s.service_notes || '',
                    raw: s
                };
            });
            columns = [
                { label: 'Service Date', key: 'service_date' },
                { label: 'Customer Name', key: 'customer' },
                { label: 'Vehicle Number', key: 'vehicle_number' },
                { label: 'Product', key: 'product' },
                { label: 'Product Type', key: 'product_type' },
                { label: 'Service Type', key: 'service_type' },
                { label: 'Status', key: 'service_status' },
                { label: 'Next Service Date', key: 'next_service_date' },
                { label: 'Notes', key: 'service_notes' }
            ];
        } else if (reportType === 'WarrantyExpiry') {
            data = allMappings.filter(m => {
                const purchaseTime = new Date(m.product_purchase_date).getTime();
                return purchaseTime >= start && purchaseTime <= end;
            }).map(m => {
                const customer = allCustomers.find(c => c.id === m.customer_id) || {};
                const product = allProducts.find(p => p.id === m.product_id) || {};
                const daysUntilExpiry = Math.ceil((new Date(m.warranty_expiry_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                
                return {
                    purchase_date: formatDate(m.product_purchase_date),
                    customer: `${customer.first_name} ${customer.last_name}`,
                    vehicle_number: customer.vehicle_number || 'N/A',
                    mobile_number: customer.mobile_number || 'N/A',
                    product: product.product_name || 'N/A',
                    product_type: product.product_type || 'N/A',
                    warranty_months: m.product_warranty_period,
                    expiry_date: formatDate(m.warranty_expiry_date),
                    days_until_expiry: daysUntilExpiry > 0 ? `${daysUntilExpiry} days` : `Expired ${Math.abs(daysUntilExpiry)} days ago`,
                    renewal_status: m.reminder_status?.warranty_renewed ? 'Renewed' : 'Active',
                    notes: m.notes || '',
                    raw: m
                };
            });
            columns = [
                { label: 'Purchase Date', key: 'purchase_date' },
                { label: 'Customer Name', key: 'customer' },
                { label: 'Vehicle Number', key: 'vehicle_number' },
                { label: 'Mobile Number', key: 'mobile_number' },
                { label: 'Product', key: 'product' },
                { label: 'Product Type', key: 'product_type' },
                { label: 'Warranty (Months)', key: 'warranty_months' },
                { label: 'Expiry Date', key: 'expiry_date' },
                { label: 'Days Until Expiry', key: 'days_until_expiry' },
                { label: 'Renewal Status', key: 'renewal_status' },
                { label: 'Notes', key: 'notes' }
            ];
        }

        return { data, columns };
    }, [reportType, startDate, endDate, allServices, allMappings, allCustomers, allProducts]);
    
    // --- Specific Customer Log Data ---
    const customerLogData = useMemo(() => {
        if (!selectedCustomerId) return [];
        const customer = allCustomers.find(c => c.id === selectedCustomerId);
        
        return allLogs
            .filter(log => log.customer_id === selectedCustomerId)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(log => ({
                date: formatDate(log.date),
                action: log.action,
                product: allProducts.find(p => p.id === log.product_id)?.product_name || 'N/A',
                product_type: allProducts.find(p => p.id === log.product_id)?.product_type || 'N/A',
                notes: log.notes || 'No notes',
                log_type: log.log_type || 'General',
                raw: log
            }));
    }, [selectedCustomerId, allLogs, allCustomers, allProducts]);

    const customerLogHeaders = [
        { label: 'Date', key: 'date' },
        { label: 'Action', key: 'action' },
        { label: 'Product', key: 'product' },
        { label: 'Product Type', key: 'product_type' },
        { label: 'Log Type', key: 'log_type' },
        { label: 'Notes', key: 'notes' }
    ];

    if (customersLoading || productsLoading || mappingsLoading || servicesLoading || logsLoading) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading report data...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 px-4 md:px-0">
            <h1 className="text-xl md:text-3xl font-bold text-gray-800">Reporting & Data Export Center</h1>

            {isExporting && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-4 md:p-6 rounded-lg shadow-xl mx-4">
                        <div className="flex items-center space-x-3">
                            <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-b-2 border-blue-600"></div>
                            <div className="text-base md:text-lg font-medium text-gray-700">Exporting data, please wait...</div>
                        </div>
                    </div>
                </div>
            )}

            {/* 1. Customer Log Export Section */}
            <Card title="Customer Log Export & Print" className="!p-4">
                <p className="text-sm text-gray-600 mb-4">Export the complete activity history for a specific customer.</p>
                <div className="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-4 items-end">
                    <div className="flex-1 w-full">
                        <Select 
                            label="Select Customer" 
                            name="customer_log_select" 
                            value={selectedCustomerId} 
                            onChange={(e) => setSelectedCustomerId(e.target.value)} 
                            options={customerOptions}
                            required
                        />
                    </div>
                    <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                        <Button 
                            onClick={() => exportToPDF(customerLogData, 'Customer_Log_Report', customerLogHeaders)} 
                             disabled={!selectedCustomerId || customerLogData.length === 0 || isExporting} 
                            color="red"
                            className="w-full md:w-auto"
                        >
                            {isExporting ? 'Exporting...' : 'Export to PDF'}
                        </Button>
                        <Button 
                            onClick={() => exportToExcel(customerLogData, 'Customer_Log_Report', customerLogHeaders)} 
                            disabled={!selectedCustomerId || customerLogData.length === 0 || isExporting} 
                            color="green"
                            className="w-full md:w-auto"
                        >
                            {isExporting ? 'Exporting...' : 'Export to Excel'}
                        </Button>
                        <Button 
                            onClick={() => handlePrint(customerLogData, 'Customer Log Report', customerLogHeaders)} 
                            disabled={!selectedCustomerId || customerLogData.length === 0 || isExporting} 
                            color="gray"
                            className="w-full md:w-auto"
                        >
                            Direct Print
                        </Button>
                    </div>
                </div>
                
                {selectedCustomerId && customerLogData.length > 0 && (
                    <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                        <h4 className="font-semibold text-gray-800 mb-2">Log Preview ({customerLogData.length} records)</h4>
                        <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
                            {customerLogData.slice(0, 5).map((log, index) => (
                                <li key={index} className="text-gray-600 truncate">
                                    <span className="font-medium text-blue-600 mr-2">{log.date}</span> - {log.action} ({log.product})
                                </li>
                            ))}
                            {customerLogData.length > 5 && <li className="text-gray-400">... showing first 5 entries.</li>}
                        </ul>
                    </div>
                )}
            </Card>

            {/* 2. System Report Generation Section */}
            <Card title="System Data Reports (Filterable)" className="!p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 items-end">
                    {/* Report Type */}
                    <Select
                        label="Report Type"
                        name="report_type"
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value)}
                        options={[
                            { value: 'ServiceHistory', label: 'Service History Report' },
                            { value: 'WarrantyExpiry', label: 'Sales/Warranty Report' },
                        ]}
                        required
                    />

                    {/* Date Range Selection */}
                    <Input label="Start Date" name="start_date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                    <Input label="End Date" name="end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                    
                    {/* Quick Filters */}
                    <div className="flex space-x-2 pb-4 col-span-1">
                        <Button onClick={() => setDateRange('Daily')} color="gray" className="text-xs py-2 px-3">Daily</Button>
                        <Button onClick={() => setDateRange('Weekly')} color="gray" className="text-xs py-2 px-3">Weekly</Button>
                        <Button onClick={() => setDateRange('Monthly')} color="gray" className="text-xs py-2 px-3">Monthly</Button>
                    </div>
                </div>

                <h3 className="text-base md:text-lg font-semibold text-gray-800 mt-6 mb-3">
                    Report Preview: {systemReportData.data.length} Records
                    <span className="ml-2 text-sm font-normal text-gray-500">
                        ({reportType === 'ServiceHistory' ? 'Service History' : 'Warranty Expiry'})
                    </span>
                </h3>
                
                {/* Export Buttons for System Reports */}
                <div className="flex flex-col md:flex-row gap-2 mb-4">
                    <Button 
                        onClick={() => exportToPDF(systemReportData.data, `${reportType}_Report`, systemReportData.columns)} 
                        disabled={systemReportData.data.length === 0 || isExporting} 
                        color="red"
                        className="w-full md:w-auto"
                    >
                        {isExporting ? 'Exporting...' : 'Export to PDF'}
                    </Button>
                    <Button 
                        onClick={() => exportToExcel(systemReportData.data, `${reportType}_Report`, systemReportData.columns)} 
                        disabled={systemReportData.data.length === 0 || isExporting} 
                        color="green"
                        className="w-full md:w-auto"
                    >
                        {isExporting ? 'Exporting...' : 'Export to Excel'}
                    </Button>
                    <Button 
                        onClick={() => handlePrint(systemReportData.data, `${reportType} Report`, systemReportData.columns)} 
                        disabled={systemReportData.data.length === 0 || isExporting} 
                        color="gray"
                        className="w-full md:w-auto"
                    >
                        Direct Print
                    </Button>
                </div>

                {/* Table Preview */}
                <div className="overflow-x-auto max-h-96">
                    <ResponsiveTable 
                        columns={systemReportData.columns.slice(0, 6)} 
                        data={systemReportData.data.slice(0, 10).map(row => {
                            const limitedRow = {};
                            systemReportData.columns.slice(0, 6).forEach(col => {
                                limitedRow[col.key] = row[col.key] || 'N/A';
                            });
                            return limitedRow;
                        })} 
                    />
                </div>

                {systemReportData.data.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">No records found for the selected report type and date range.</div>
                ) : (
                    <div className="mt-3 text-sm text-gray-600">
                        Showing first 10 of {systemReportData.data.length} records. 
                        Export to see full data with all {systemReportData.columns.length} columns.
                    </div>
                )}
            </Card>
        </div>
    );
};

// --- MAIN APP COMPONENT ---

const VIEWS = {
    DASHBOARD: 'Dashboard',
    SALES: 'New Sales Assignment',
    PRODUCTS: 'Product Master',
    SERVICES: 'Service Master',
    CUSTOMERS: 'Customer Management',
    REPORTS: 'Reports'
};

const App = () => {
    const [currentView, setCurrentView] = useState(VIEWS.DASHBOARD);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [offlineQueue, setOfflineQueue] = useState(() => {
        try {
            const queue = localStorage.getItem('offline_queue');
            return queue ? JSON.parse(queue) : [];
        } catch {
            return [];
        }
    });

    // 監聽網絡狀態
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            syncOfflineData();
        };
        const handleOffline = () => setIsOnline(false);
        
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // 同步離線數據
    const syncOfflineData = async () => {
        try {
            const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
            if (queue.length === 0) return;

            console.log('Syncing offline data...', queue.length, 'items');
            
            for (const item of queue) {
                try {
                    if (item.action === 'add') {
                        await addDoc(collection(db, item.collection), {
                            ...item.data,
                            created_at: serverTimestamp(),
                            updated_at: serverTimestamp()
                        });
                    } else if (item.action === 'update') {
                        const docRef = doc(db, item.collection, item.id);
                        await updateDoc(docRef, {
                            ...item.data,
                            updated_at: serverTimestamp()
                        });
                    } else if (item.action === 'delete') {
                        const docRef = doc(db, item.collection, item.id);
                        await deleteDoc(docRef);
                    }
                } catch (error) {
                    console.error('Error syncing item:', error);
                }
            }

            // 清除已同步的隊列
            localStorage.removeItem('offline_queue');
            setOfflineQueue([]);
            
            alert('Offline data has been synced successfully!');
        } catch (error) {
            console.error('Error syncing offline data:', error);
        }
    };

    const renderContent = () => {
        switch (currentView) {
            case VIEWS.SALES:
                return <SalesAssignment />;
            case VIEWS.PRODUCTS:
                return <ProductMaster />;
            case VIEWS.SERVICES:
                return <ServiceMaster />;
            case VIEWS.CUSTOMERS:
                return <CustomerManagementView />;
            case VIEWS.REPORTS:
                return <ReportingModule />;
            case VIEWS.DASHBOARD:
            default:
                return <AdminDashboard />;
        }
    };

    const NavItem = ({ view }) => (
        <button
            onClick={() => {
                setCurrentView(view);
                setIsMobileMenuOpen(false);
            }}
            className={`px-3 md:px-4 py-2 rounded-lg font-medium transition duration-150 text-sm ${
                currentView === view
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-700 hover:bg-gray-100'
            }`}
        >
            {view}
        </button>
    );

    return (
        <FirebaseDataProvider>
            <ErrorBoundary>
                <div className="min-h-screen bg-gray-50 font-sans antialiased flex flex-col">
                    <header className="bg-white shadow-md sticky top-0 z-20">
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                            <div className="text-lg md:text-2xl font-extrabold text-blue-800 flex items-center">
                                <svg className="w-5 h-5 md:w-6 md:h-6 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                               Umiya Tank Testing Plant
                            </div>
                            
                            {/* Network Status Indicator */}
                            <div className="hidden md:flex items-center mr-4">
                                <div className={`flex items-center ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                                    <div className={`w-2 h-2 rounded-full mr-2 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                    <span className="text-sm font-medium">
                                        {isOnline ? 'Online' : 'Offline'}
                                    </span>
                                </div>
                                {offlineQueue.length > 0 && (
                                    <div className="ml-3 flex items-center text-orange-600">
                                        <div className="w-2 h-2 rounded-full bg-orange-500 mr-2"></div>
                                        <span className="text-sm font-medium">
                                            {offlineQueue.length} pending
                                        </span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Desktop Navigation */}
                            <nav className="hidden md:flex space-x-2">
                                <NavItem view={VIEWS.DASHBOARD} />
                                <NavItem view={VIEWS.SALES} />
                                <NavItem view={VIEWS.CUSTOMERS} />
                                <NavItem view={VIEWS.PRODUCTS} />
                                <NavItem view={VIEWS.SERVICES} />
                                <NavItem view={VIEWS.REPORTS} />
                            </nav>

                            {/* Mobile Menu Button - ONLY HAMBURGER */}
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
                        
                        {/* Mobile Navigation Menu - ONLY WHEN HAMBURGER IS CLICKED */}
                        {isMobileMenuOpen && (
                            <div className="md:hidden bg-white border-t shadow-lg">
                                <div className="px-4 py-3">
                                    {/* Network Status for Mobile */}
                                    <div className="mb-3 p-2 bg-gray-50 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <div className={`flex items-center ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
                                                <div className={`w-2 h-2 rounded-full mr-2 ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                <span className="text-sm font-medium">
                                                    {isOnline ? 'Online' : 'Offline'}
                                                </span>
                                            </div>
                                            {offlineQueue.length > 0 && (
                                                <Button 
                                                    onClick={syncOfflineData}
                                                    color="orange"
                                                    className="text-xs py-1 px-2"
                                                    disabled={!isOnline}
                                                >
                                                    Sync {offlineQueue.length} pending
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <NavItem view={VIEWS.DASHBOARD} />
                                        <NavItem view={VIEWS.SALES} />
                                        <NavItem view={VIEWS.CUSTOMERS} />
                                        <NavItem view={VIEWS.PRODUCTS} />
                                        <NavItem view={VIEWS.SERVICES} />
                                        <NavItem view={VIEWS.REPORTS} />
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
        </FirebaseDataProvider>
    );
};

export default App;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             