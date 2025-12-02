import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where } from 'firebase/firestore';
import AuthForm from './AuthForm';
const firebaseConfig = {
  apiKey: null, // ખાલી રાખેલ છે
  authDomain: "mock-project.firebaseapp.com",
  projectId: "mock-project-id",
  storageBucket: "mock-storage-bucket",
  messagingSenderId: "mock-sender-id",
  appId: "mock-app-id"
};
function Root() {
  return (
    <div className="App">
      <AuthForm />
    </div>
  );
}
const appId = 'default-cng-app-id';
const __initial_auth_token = null;

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
    return new Date(dateString).toLocaleDateString('en-GB');
};

const useFirebase = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState('MOCK_USER_ID'); // Mock User ID
    const [isAuthReady, setIsAuthReady] = useState(false);

    useEffect(() => {
        if (!firebaseConfig.apiKey) {
            console.log("MOCK MODE: Firebase API key is missing. Loading UI only.");
            setDb({ /* Mock DB object */ }); 
            setAuth({ currentUser: { uid: 'MOCK_USER_ID' } }); 
            setIsAuthReady(true);
            return;
        }
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const fAuth = getAuth(app);
            setDb(firestore);
            setAuth(fAuth);

            const unsubscribe = onAuthStateChanged(fAuth, (user) => {
                setUserId(user ? user.uid : null);
                setIsAuthReady(true);
            });

            const handleSignIn = async () => {
                if (__initial_auth_token) {
                    await signInWithCustomToken(fAuth, __initial_auth_token);
                } else {
                    await signInAnonymously(fAuth);
                }
            };
            handleSignIn();
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase Initialization Failed. Running in UI Mock Mode.", error);
            setDb({ /* Mock DB object */ }); 
            setAuth({ currentUser: { uid: 'MOCK_USER_ID' } }); 
            setIsAuthReady(true);
        }
    }, []);
    return { db, auth, userId, isAuthReady };
};

const getCollectionRef = (db, collectionName) => {
    if (!db.collection) return {
        __isMock: true,
        name: collectionName
    }; 
    return collection(db, 'artifacts', appId, 'public', 'data', collectionName);
};

const getDocumentRef = (db, collectionName, id) => {
    if (!db.doc) return { __isMock: true, name: collectionName, id: id };
    return doc(db, 'artifacts', appId, 'public', 'data', collectionName, id);
};

const Card = ({ children, title, className = '' }) => (
    <div className={`bg-white p-6 rounded-xl shadow-lg ${className}`}>
        {title && <h2 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">{title}</h2>}
        {children}
    </div>
);

const Button = ({ children, onClick, color = 'blue', disabled = false, className = '', type = 'button' }) => (
    <button
        onClick={onClick}
        type={type}
        disabled={disabled}
        className={`px-4 py-2 rounded-lg font-medium transition duration-150 ease-in-out ${className}
        ${disabled ? 'bg-gray-400 cursor-not-allowed' :
            color === 'blue' ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md' :
            color === 'red' ? 'bg-red-600 hover:bg-red-700 text-white shadow-md' :
            color === 'green' ? 'bg-green-600 hover:bg-green-700 text-white shadow-md' :
            'bg-gray-200 hover:bg-gray-300 text-gray-800 shadow-sm'
        }`}>
        {children} 
    </button>
);
const Input = ({ label, name, type = 'text', value, onChange, placeholder = '', required = false, disabled = false, className = '' }) => (
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
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 ${className}`}
        />
    </div>
);

const Select = ({ label, name, value, onChange, options, required = false, className = '' }) => (
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
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white ${className}`} >
            <option value="" disabled>Select {label}</option>
            {options.map((option, index) => (
                <option key={index} value={option.value}>{option.label}</option>
            ))}
        </select>
    </div>
);

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
        rem_1_sent: false, rem_2_sent: false, rem_3_sent: false,
        renewal_sent: false, warranty_renewed: false 
    },
    notes: ''
};

const mockProducts = [
    { id: 'P001', product_id: 'KIT-A', product_name: 'EcoGas Pro', product_type: 'Sequential', manufacturer: 'XYZ Gas', warranty_period_months: 18, default_service_cycle_days: 180 },
    { id: 'P002', product_id: 'KIT-B', product_name: 'PowerFlow Turbo', product_type: 'Advanced', manufacturer: 'ABC Fuel', warranty_period_months: 24, default_service_cycle_days: 90 },
];
const mockCustomers = [
    { id: 'C001', first_name: 'Amit', last_name: 'Patel', mobile_number: '9876543210', vehicle_number: 'GJ01AB1234' },
    { id: 'C002', first_name: 'Priya', last_name: 'Shah', mobile_number: '9988776655', vehicle_number: 'MH02XY5678' },
];
const mockMappings = [
    { id: 'M001', customer_id: 'C001', product_id: 'P001', product_purchase_date: '2024-01-01', product_warranty_period: 18, warranty_expiry_date: calculateExpiryDate('2024-01-01', 18), reminder_status: { warranty_renewed: false } },
];
const mockServices = [
    { id: 'S001', customer_name: 'Amit Patel', vehicle_number: 'GJ01AB1234', service_date: '2024-06-15', service_type: 'Regular', service_status: 'Completed', next_service_date: calculateNextServiceDate('2024-06-15', 180) },
];

const SalesAssignment = ({ db, userId, isAuthReady, allProducts, allCustomers, allMappings }) => {
    const [customerType, setCustomerType] = useState('new');
    const [customerData, setCustomerData] = useState(initialCustomerData);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [mappingData, setMappingData] = useState(initialMappingData);
    const [message, setMessage] = useState('');
    const [renewalConfirmation, setRenewalConfirmation] = useState(null);

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
            } }
        setMappingData(newMappingData);
    };

    const handleSaveAssignment = async (e) => {
        e.preventDefault();
        setMessage('');
        setRenewalConfirmation(null);
        if (!db || !isAuthReady || db.__isMock) {
            setMessage('Success! Data captured locally. (Firebase is not connected in UI mode)');
            setRenewalConfirmation({ customerName: 'Demo Customer', renewalDate: formatDate(new Date().toISOString()), newExpiryDate: formatDate(mappingData.warranty_expiry_date) });
            resetForm();
            return;
        }};

    const resetForm = () => {
        setCustomerData(initialCustomerData);
        setSelectedCustomerId('');
        setMappingData(initialMappingData);
    };

    const productOptions = allProducts.map(p => ({ value: p.id, label: `${p.product_name} (${p.product_type} - ${p.warranty_period_months}M)` }));
    const customerOptions = allCustomers.map(c => ({ value: c.id, label: `${c.first_name} ${c.last_name} (${c.vehicle_number})` }));

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">New Sales Assignment (Customer & Warranty Setup)</h1>
            {message && (
                <div className={`p-4 rounded-lg font-medium ${message.startsWith('Success') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {message}
                </div>
            )}
            {renewalConfirmation && (
                   <Card title="Renewal Confirmation Message (Auto-Sent)">
                        <p className="text-gray-700">The following message was automatically sent to the customer via WhatsApp/SMS (Simulation):</p>
                        <div className="mt-3 p-4 bg-yellow-50 border border-yellow-300 rounded-lg font-mono text-sm">
                            <p>Hello {renewalConfirmation.customerName},</p>
                            <p>Your CNG Kit warranty has been successfully **Renewed** on **{renewalConfirmation.renewalDate}**.</p>
                            <p>Your new warranty expiry date is **{renewalConfirmation.newExpiryDate}**.</p>
                            <p>Thank you for choosing our service!</p>
                        </div>
                    </Card>
            )}
            <form onSubmit={handleSaveAssignment} className="space-y-6">
                <Card title="Customer Identification">
                    <div className="flex space-x-6">
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
                                onChange={() => { setCustomerType('existing'); setCustomerData(initialCustomerData); }}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                            />
                            <span className="text-gray-700 font-medium">Existing Customer / Renewal</span>
                        </label>
                    </div>
                </Card>

                <Card title={customerType === 'new' ? "1. New Customer Details" : "1. Select Existing Customer"}>
                    {customerType === 'new' ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Input label="First Name" name="first_name" value={customerData.first_name} onChange={handleCustomerChange} required />
                            <Input label="Last Name / Surname" name="last_name" value={customerData.last_name} onChange={handleCustomerChange} required />
                            <Input label="Mobile Number" name="mobile_number" value={customerData.mobile_number} onChange={handleCustomerChange} required type="tel" placeholder="e.g., +919876543210" />
                            
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

                <Card title="2. Product Assignment & Warranty Setup">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        
                        <Select label="Product Kit Model" name="product_id" value={mappingData.product_id} onChange={handleMappingChange} options={productOptions} required />
                        
                        <Input label="Purchase Date" name="product_purchase_date" value={mappingData.product_purchase_date} onChange={handleMappingChange} required type="date" />
                        
                        <Input label="Fitting Date (Optional)" name="product_fitting_date" value={mappingData.product_fitting_date} onChange={handleMappingChange} type="date" />

                        <Input label="Warranty Period (Months - Editable)" name="product_warranty_period" value={mappingData.product_warranty_period} onChange={handleMappingChange} required type="number" min="1" />

                        <div className="md:col-span-2">
                            <Input label="Warranty Expiry Date (Auto)" name="warranty_expiry_date" value={formatDate(mappingData.warranty_expiry_date)} disabled />
                        </div>
                        <div className="md:col-span-2">
                            <Input label="Next Reminder(s) (Dynamic)" name="next_warranty_reminder_date" value="Calculated by cron logic" disabled />
                        </div>

                        <div className="md:col-span-4">
                            <Input label="Notes / Remarks (Log Entry)" name="notes" value={mappingData.notes} onChange={handleMappingChange} />
                        </div>
                    </div>
                </Card>

                <div className="flex justify-center space-x-4 pt-4">
                    <Button 
                        type="submit" 
                        color="blue" 
                        className="w-64 py-3 text-lg font-bold"
                        disabled={customerType === 'existing' && !selectedCustomerId}
                    >
                        Save {customerType === 'new' ? 'New Customer' : 'Renewal'} (Mock Save)
                    </Button>
                    <Button type="button" onClick={resetForm} color="gray" className="w-32 py-3 text-lg">
                        Clear Form
                    </Button>
                </div>
            </form>
            <CustomerProductMappingList allCustomers={allCustomers} allProducts={allProducts} allMappings={allMappings} />
        </div>
    );};

const CustomerProductMappingList = ({ allCustomers, allProducts, allMappings }) => {
    const mergedMappings = useMemo(() => {
        return allMappings.map(m => {
            const customer = allCustomers.find(c => c.id === m.customer_id) || {};
            const product = allProducts.find(p => p.id === m.product_id) || {};
            return { ...m, customer, product };
        });
    }, [allMappings, allCustomers, allProducts]);

    return (
        <Card title="Current Product Assignments & Warranties (Mock Data)">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purchase Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Warranty (M)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Renewal Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {mergedMappings.map(m => (
                            <tr key={m.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{m.customer.first_name} {m.customer.last_name} ({m.customer.vehicle_number})</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{m.product.product_name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(m.product_purchase_date)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{m.product_warranty_period}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-semibold">{formatDate(m.warranty_expiry_date)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        m.reminder_status?.warranty_renewed ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                                    }`}>
                                        {m.reminder_status?.warranty_renewed ? 'Renewed' : 'Active'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );};

const ProductMaster = ({ db, isAuthReady }) => {
    const [products, setProducts] = useState(mockProducts);
    const [formData, setFormData] = useState({
        product_id: '', product_name: '', product_type: '', manufacturer: '',
        warranty_period_months: 12, default_service_cycle_days: 180
    });
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false); 

    useEffect(() => {
        setProducts(mockProducts);
    }, []);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        alert('Action Blocked: Running in UI Mock Mode. Cannot save to Firebase.');
        resetForm();
    };

    const handleEdit = (product) => {
        setFormData(product);
        setIsEditing(true);
    };

    const handleDelete = async (id) => {
        alert(`Action Blocked: Running in UI Mock Mode. Cannot delete product ID: ${id}`);
    };
    const resetForm = () => {
        setFormData({
            product_id: '', product_name: '', product_type: '', manufacturer: '',
            warranty_period_months: 12, default_service_cycle_days: 180
        });
        setIsEditing(false);
    };
    if (loading) return <div className="text-center py-8">Loading Product Data...</div>;
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Product Master</h1>
            <Card title={isEditing ? 'Edit Product' : 'Add New Product'}>
                <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input label="Product ID" name="product_id" value={formData.product_id} onChange={handleChange} required />
                    <Input label="Product Name" name="product_name" value={formData.product_name} onChange={handleChange} required />
                    <Input label="Product Type (CNG Kit Model)" name="product_type" value={formData.product_type} onChange={handleChange} required />
                    <Input label="Manufacturer" name="manufacturer" value={formData.manufacturer} onChange={handleChange} />
                    <Input label="Warranty Period (months)" name="warranty_period_months" value={formData.warranty_period_months} onChange={handleChange} required type="number" min="1" />
                    <Input label="Default Service Cycle (days)" name="default_service_cycle_days" value={formData.default_service_cycle_days} onChange={handleChange} type="number" min="1" />
                    <div className="md:col-span-3 flex justify-end space-x-3">
                        <Button type="submit" color="blue">{isEditing ? 'Update Product (Mock)' : 'Add Product (Mock)'}</Button>
                        <Button type="button" onClick={resetForm} color="gray">Cancel</Button>
                    </div>
                </form>
            </Card>

            <Card title="Product List (Mock Data)">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name / Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manufacturer</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Warranty (M)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Cycle (D)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {products.map(p => (
                                <tr key={p.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.product_id}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.product_name} / {p.product_type}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.manufacturer}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.warranty_period_months}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.default_service_cycle_days}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                        <Button onClick={() => handleEdit(p)} color="gray" className="text-xs py-1 px-2">Edit (Mock)</Button>
                                        <Button onClick={() => handleDelete(p.id)} color="red" className="text-xs py-1 px-2">Delete (Mock)</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );};

const ServiceMaster = ({ db, isAuthReady, allCustomers, allProducts }) => {
    const [services, setServices] = useState(mockServices);
    const [formData, setFormData] = useState({
        customer_id: '',
        service_date: new Date().toISOString().split('T')[0],
        service_type: 'Regular',
        service_status: 'Completed',
        service_notes: '',
        next_service_date: ''
    });
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setServices(mockServices);
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const newFormData = { ...prev, [name]: value };
            const cycleDays = 180; 
            if (name === 'customer_id' || name === 'service_date') {
                if (newFormData.service_date) {
                    newFormData.next_service_date = calculateNextServiceDate(newFormData.service_date, cycleDays);
                }
            }
            return newFormData;
        });};

    const handleSave = async (e) => {
        e.preventDefault();
        alert('Action Blocked: Running in UI Mock Mode. Cannot save service record.');
        resetForm();};

    const handleEdit = (service) => {
        setFormData(service);
        setIsEditing(true);
    };

    const handleDelete = async (id) => {
        alert(`Action Blocked: Running in UI Mock Mode. Cannot delete service ID: ${id}`);
    };

    const resetForm = () => {
        setFormData({
            customer_id: '',
            service_date: new Date().toISOString().split('T')[0],
            service_type: 'Regular',
            service_status: 'Completed',
            service_notes: '',
            next_service_date: ''
        });
        setIsEditing(false);
    };

    const customerOptions = allCustomers.map(c => ({ value: c.id, label: `${c.first_name} ${c.last_name} (${c.vehicle_number})` }));
 
    if (customerOptions.length === 0) {
        mockCustomers.forEach(c => customerOptions.push({ value: c.id, label: `${c.first_name} ${c.last_name} (${c.vehicle_number})` }));
    }

    if (loading) return <div className="text-center py-8">Loading Service Data...</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Service Master</h1>
            <Card title={isEditing ? 'Edit Service Record' : 'Add New Service Record'}>
                <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    
                    <div className="md:col-span-2">
                        <Select label="Select Customer (Vehicle)" name="customer_id" value={formData.customer_id} onChange={handleChange} options={customerOptions} required />
                    </div>

                    <Input label="Service Date" name="service_date" value={formData.service_date} onChange={handleChange} required type="date" />
                    <Input label="Next Service Due (Auto)" name="next_service_date" value={formatDate(formData.next_service_date)} disabled />
                    
                    <Select label="Service Type" name="service_type" value={formData.service_type} onChange={handleChange} options={[
                        { value: 'Regular', label: 'Regular' },
                        { value: 'Warranty', label: 'Warranty' },
                        { value: 'Complaint', label: 'Complaint' },
                        { value: 'Emergency', label: 'Emergency' },
                    ]} required />
                    <Select label="Service Status" name="service_status" value={formData.service_status} onChange={handleChange} options={[
                        { value: 'Completed', label: 'Completed' },
                        { value: 'Pending', label: 'Pending' },
                        { value: 'Cancelled', label: 'Cancelled' },
                    ]} required />

                    <div className="md:col-span-4">
                        <Input label="Service Notes / Details" name="service_notes" value={formData.service_notes} onChange={handleChange} />
                    </div>

                    <div className="md:col-span-4 flex justify-end space-x-3">
                        <Button type="submit" color="blue">{isEditing ? 'Update Service (Mock)' : 'Add Service (Mock)'}</Button>
                        <Button type="button" onClick={resetForm} color="gray">Cancel</Button>
                    </div>
                </form>
            </Card>

            <Card title="Service History (Mock Data)">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer (Vehicle)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Service</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {services.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.customer_name} ({s.vehicle_number})</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(s.service_date)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.service_type}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            s.service_status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {s.service_status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold">{formatDate(s.next_service_date)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                        <Button onClick={() => handleEdit(s)} color="gray" className="text-xs py-1 px-2">Edit (Mock)</Button>
                                        <Button onClick={() => handleDelete(s.id)} color="red" className="text-xs py-1 px-2">Delete (Mock)</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );};

const CustomerMaster = ({ allCustomers, allProducts, allMappings }) => {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Customer List (Warranties)</h1>
            <CustomerProductMappingList 
                allCustomers={allCustomers} 
                allProducts={allProducts} 
                allMappings={allMappings} 
            />
        </div>
    );
};

const App = () => {
    const { db, userId, isAuthReady } = useFirebase();
    const [view, setView] = useState('SalesAssignment');
    const [allCustomers, setAllCustomers] = useState(mockCustomers);
    const [allProducts, setAllProducts] = useState(mockProducts);
    const [allMappings, setAllMappings] = useState(mockMappings);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setAllCustomers(mockCustomers);
        setAllProducts(mockProducts);
        setAllMappings(mockMappings);

        if (!db || !isAuthReady || firebaseConfig.apiKey === null) {
            setLoading(false); // Finish loading state immediately in mock mode
            return;
        }
        setLoading(false); // In case of real Firebase config, this will be handled by onSnapshot
    }, [db, isAuthReady]);

    const renderView = () => {
        if (!isAuthReady) {
            return (
                <div className="text-center py-20 text-xl font-medium text-blue-600">
                    Initializing UI in Mock Mode...
                </div>
            );
        }
        switch (view) {
            case 'SalesAssignment':
                return (
                    <SalesAssignment
                        db={db}
                        userId={userId} 
                        isAuthReady={isAuthReady}
                        allProducts={allProducts}
                        allCustomers={allCustomers}
                        allMappings={allMappings}
                    />
                );
            case 'ProductMaster':
                return <ProductMaster db={db} isAuthReady={isAuthReady} />;
            case 'ServiceMaster':
                return (
                    <ServiceMaster
                        db={db}
                        isAuthReady={isAuthReady}
                        allCustomers={allCustomers}
                        allProducts={allProducts}
                    />
                );
            case 'CustomerMaster':
                return (
                    <CustomerMaster
                        allCustomers={allCustomers} 
                        allProducts={allProducts} 
                        allMappings={allMappings}
                    />
                );
            default:
                return <h1 className="text-4xl text-center mt-10">404 View Not Found</h1>;
        }};

    return (
        <div className="min-h-screen bg-gray-100">
            <nav className="bg-blue-600 shadow-md">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center">
                            <span className="text-white text-xl font-bold tracking-wider">
                                ⛽ CNG CRM (UI MOCK MODE)
                            </span>
                        </div>
                        <div className="flex space-x-4">
                            {[
             
                                { name: 'Sales & Warranty', key: 'SalesAssignment' },
                                { name: 'Service Entry', key: 'ServiceMaster' },
                                { name: 'Customer List', key: 'CustomerMaster' },
                                { name: 'Product Master', key: 'ProductMaster' },
                            ].map((item) => (
                                <button
                                    key={item.key}
                                    onClick={() => setView(item.key)}
                                    className={`px-3 py-2 rounded-md text-sm font-medium transition duration-150 ${
                                        view === item.key
                                            ? 'bg-blue-800 text-white'
                                            : 'text-blue-100 hover:bg-blue-500 hover:text-white'
                                    }`}
                                >
                                    {item.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </nav>
            <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                {renderView()}
            </main>
        </div>
    );
};
export default App;