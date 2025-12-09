import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx/xlsx.mjs';

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
    return new Date(dateString).toLocaleDateString('en-GB');
};

// --- UTILITY COMPONENTS ---

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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white"
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
    product_warranty_period: 12, // Default to 12 months
    warranty_expiry_date: '',
    // Reminder status tracking
    reminder_status: {
        rem_1_sent: false, // 1 month before
        rem_2_sent: false, // 15 days before
        rem_3_sent: false, // 1 day before
        renewal_sent: false, // Renewal confirmation
        warranty_renewed: false // Flag indicating renewal occurred
    },
    notes: ''
};

// DEMO STATIC DATA
const demoProducts = [
    { id: 'p1', product_id: 'CNG-100', product_name: 'CNG Premium Kit', product_type: 'Sequential', manufacturer: 'CNG Tech', warranty_period_months: 24, default_service_cycle_days: 180 },
    { id: 'p2', product_id: 'CNG-200', product_name: 'CNG Economy Kit', product_type: 'Venturi', manufacturer: 'Gas Systems', warranty_period_months: 12, default_service_cycle_days: 90 },
    { id: 'p3', product_id: 'CNG-300', product_name: 'CNG Advanced Kit', product_type: 'Sequential', manufacturer: 'Auto Gas', warranty_period_months: 36, default_service_cycle_days: 365 }
];

const demoCustomers = [
    { id: 'c1', first_name: 'Rajesh', last_name: 'Kumar', mobile_number: '+919876543210', whatsapp_number: '+919876543210', address: '123 Main St', city: 'Mumbai', state: 'Maharashtra', vehicle_number: 'MH01AB1234', vehicle_model: 'Maruti Suzuki WagonR' },
    { id: 'c2', first_name: 'Priya', last_name: 'Sharma', mobile_number: '+919123456789', whatsapp_number: '+919123456789', address: '456 Park Ave', city: 'Delhi', state: 'Delhi', vehicle_number: 'DL02CD5678', vehicle_model: 'Hyundai i20' },
    { id: 'c3', first_name: 'Amit', last_name: 'Patel', mobile_number: '+919555555555', whatsapp_number: '+919555555555', address: '789 MG Road', city: 'Bangalore', state: 'Karnataka', vehicle_number: 'KA03EF9012', vehicle_model: 'Tata Indica' }
];

const demoMappings = [
    { id: 'm1', customer_id: 'c1', product_id: 'p1', product_purchase_date: '2024-01-15', product_fitting_date: '2024-01-20', product_warranty_period: 24, warranty_expiry_date: '2026-01-14', reminder_status: { rem_1_sent: false, rem_2_sent: false, rem_3_sent: false, renewal_sent: false, warranty_renewed: false }, notes: 'Initial installation' },
    { id: 'm2', customer_id: 'c2', product_id: 'p2', product_purchase_date: '2024-02-10', product_fitting_date: '2024-02-15', product_warranty_period: 12, warranty_expiry_date: '2025-02-09', reminder_status: { rem_1_sent: true, rem_2_sent: false, rem_3_sent: false, renewal_sent: false, warranty_renewed: false }, notes: 'Regular customer' },
    { id: 'm3', customer_id: 'c3', product_id: 'p3', product_purchase_date: '2023-12-01', product_fitting_date: '2023-12-05', product_warranty_period: 36, warranty_expiry_date: '2026-11-30', reminder_status: { rem_1_sent: true, rem_2_sent: true, rem_3_sent: false, renewal_sent: true, warranty_renewed: true }, notes: 'Warranty renewed' }
];

const demoServices = [
    { id: 's1', customer_id: 'c1', product_id: 'p1', service_date: '2024-03-15', service_type: 'Regular', service_status: 'Completed', service_notes: 'Routine maintenance', next_service_date: '2024-09-15' },
    { id: 's2', customer_id: 'c2', product_id: 'p2', service_date: '2024-04-10', service_type: 'Warranty', service_status: 'Completed', service_notes: 'Free service under warranty', next_service_date: '2024-07-10' },
    { id: 's3', customer_id: 'c3', product_id: 'p3', service_date: '2024-02-20', service_type: 'Emergency', service_status: 'Pending', service_notes: 'Pressure issue reported', next_service_date: '2025-02-20' }
];

const demoLogs = [
    { id: 'l1', customer_id: 'c1', action: 'Product Assignment', date: '2024-01-15', notes: 'New CNG Kit installed', product_id: 'p1', log_type: 'Warranty/Sales' },
    { id: 'l2', customer_id: 'c1', action: 'Service Record', date: '2024-03-15', notes: 'Regular maintenance completed', product_id: 'p1', log_type: 'Service' },
    { id: 'l3', customer_id: 'c2', action: 'Product Assignment', date: '2024-02-10', notes: 'Economy kit installation', product_id: 'p2', log_type: 'Warranty/Sales' },
    { id: 'l4', customer_id: 'c3', action: 'Warranty Renewal', date: '2024-03-01', notes: 'Extended warranty for 3 years', product_id: 'p3', log_type: 'Warranty/Sales' }
];

// 1. CONSOLIDATED SALES ASSIGNMENT VIEW
const SalesAssignment = ({ allProducts, allCustomers, allMappings }) => {
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
            }
        }
        setMappingData(newMappingData);
    };

    const handleSaveAssignment = async (e) => {
        e.preventDefault();
        setMessage('');
        setRenewalConfirmation(null);

        let finalCustomerId = selectedCustomerId;
        let logAction = 'Product Assignment';
        let customerName = '';

        try {
            if (customerType === 'new') {
                // Simulate creating new customer
                finalCustomerId = 'new-customer-' + Date.now();
                customerName = customerData.first_name;
                alert('New customer would be created in real implementation');
            } else {
                if (!selectedCustomerId) {
                    setMessage('Error: Please select an existing customer.');
                    return;
                }
                const existingCustomer = allCustomers.find(c => c.id === selectedCustomerId);
                customerName = existingCustomer?.first_name || 'Existing Customer';
                logAction = 'Warranty Renewal';
                mappingData.reminder_status.warranty_renewed = true; 
            }

            const calculatedExpiryDate = calculateExpiryDate(mappingData.product_purchase_date, mappingData.product_warranty_period);

            // Simulate saving to database
            alert(`${customerType === 'new' ? 'New Customer' : 'Warranty Renewal'} saved successfully!\nCustomer: ${customerName}\nExpiry Date: ${formatDate(calculatedExpiryDate)}`);
            
            // Generate and display renewal confirmation message
            if (customerType === 'existing') {
                setRenewalConfirmation({
                    customerName: customerName,
                    renewalDate: formatDate(new Date().toISOString()),
                    newExpiryDate: formatDate(calculatedExpiryDate)
                });
            }

            setMessage(`Success! ${customerName}'s assignment/renewal saved.`);
            resetForm();

        } catch (error) {
            console.error("Error saving sales assignment:", error);
            setMessage(`Error: Failed to save assignment.`);
        }
    };

    const resetForm = () => {
        setCustomerData(initialCustomerData);
        setSelectedCustomerId('');
        setMappingData(initialMappingData);
    };

    const productOptions = allProducts.map(p => ({ value: p.id, label: `${p.product_name} (${p.product_type} - ${p.warranty_period_months}M)` }));
    const customerOptions = allCustomers.map(c => ({ value: c.id, label: `${c.first_name} ${c.last_name} (${c.vehicle_number})` }));


    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">New Sales Assignment (Customer & Warranty Setup) - DEMO MODE</h1>

            {message && (
                <div className={`p-4 rounded-lg font-medium ${message.startsWith('Success') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {message}
                </div>
            )}
            
            {/* Warranty Renewed Confirmation Message */}
            {renewalConfirmation && (
                 <Card title="Renewal Confirmation Message (Auto-Sent)">
                    <p className="text-gray-700">The following message was automatically sent to the customer via WhatsApp/SMS:</p>
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
                        Save {customerType === 'new' ? 'New Customer' : 'Renewal'}
                    </Button>
                    <Button type="button" onClick={resetForm} color="gray" className="w-32 py-3 text-lg">
                        Clear Form
                    </Button>
                </div>
            </form>
            
            <CustomerProductMappingList allCustomers={allCustomers} allProducts={allProducts} allMappings={allMappings} />
        </div>
    );
};


// 7. Customer Product Mapping List (Utility - keeping only the list view for reference)
const CustomerProductMappingList = ({ allCustomers, allProducts, allMappings }) => {
    
    const mergedMappings = useMemo(() => {
        return allMappings.map(m => {
            const customer = allCustomers.find(c => c.id === m.customer_id) || {};
            const product = allProducts.find(p => p.id === m.product_id) || {};
            return { ...m, customer, product };
        });
    }, [allMappings, allCustomers, allProducts]);


    return (
        <Card title="Current Product Assignments & Warranties">
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
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{m.customer.first_name} ({m.customer.vehicle_number})</td>
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
    );
};


// 2. Product Master (Keeping CRUD functionality for managing products)
const ProductMaster = () => {
    const [products, setProducts] = useState(demoProducts);
    const [formData, setFormData] = useState({
        product_id: '', product_name: '', product_type: '', manufacturer: '',
        warranty_period_months: 12, default_service_cycle_days: 180
    });
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            if (isEditing) {
                // Simulate update
                setProducts(products.map(p => p.id === formData.id ? formData : p));
                alert('Product updated successfully!');
            } else {
                // Simulate add
                const newProduct = { ...formData, id: 'p' + (products.length + 1) };
                setProducts([...products, newProduct]);
                alert('Product added successfully!');
            }
            resetForm();
        } catch (error) {
            console.error("Error saving product:", error);
            alert('Error saving product');
        }
    };

    const handleEdit = (product) => {
        setFormData(product);
        setIsEditing(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this product?')) {
            try {
                // Simulate delete
                setProducts(products.filter(p => p.id !== id));
                alert('Product deleted successfully!');
            } catch (error) {
                console.error("Error deleting product:", error);
                alert('Error deleting product');
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

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Product Master - DEMO MODE</h1>
            <Card title={isEditing ? 'Edit Product' : 'Add New Product'}>
                <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input label="Product ID" name="product_id" value={formData.product_id} onChange={handleChange} required />
                    <Input label="Product Name" name="product_name" value={formData.product_name} onChange={handleChange} required />
                    <Input label="Product Type (CNG Kit Model)" name="product_type" value={formData.product_type} onChange={handleChange} required />
                    <Input label="Manufacturer" name="manufacturer" value={formData.manufacturer} onChange={handleChange} />
                    <Input label="Warranty Period (months)" name="warranty_period_months" value={formData.warranty_period_months} onChange={handleChange} required type="number" min="1" />
                    <Input label="Default Service Cycle (days)" name="default_service_cycle_days" value={formData.default_service_cycle_days} onChange={handleChange} type="number" min="1" />
                    <div className="md:col-span-3 flex justify-end space-x-3">
                        <Button type="submit" color="blue">{isEditing ? 'Update Product' : 'Add Product'}</Button>
                        <Button type="button" onClick={resetForm} color="gray">Cancel</Button>
                    </div>
                </form>
            </Card>

            <Card title="Product List">
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
                                        <Button onClick={() => handleEdit(p)} color="gray" className="text-xs py-1 px-2">Edit</Button>
                                        <Button onClick={() => handleDelete(p.id)} color="red" className="text-xs py-1 px-2">Delete</Button>
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


// 4. Service Master
const ServiceMaster = ({ allCustomers, allProducts }) => {
    const [services, setServices] = useState(demoServices);
    const [formData, setFormData] = useState({
        service_date: new Date().toISOString().split('T')[0],
        service_type: 'Regular',
        service_status: 'Completed',
        next_service_date: ''
    });
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);

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
        try {
            if (!formData.customer_id || !formData.product_id || !formData.service_date) {
                console.error("Missing required fields: Customer, Product, or Date.");
                alert('Please fill all required fields');
                return;
            }

            if (isEditing) {
                // Simulate update
                setServices(services.map(s => s.id === formData.id ? formData : s));
                alert('Service record updated successfully!');
            } else {
                // Simulate add
                const newService = { ...formData, id: 's' + (services.length + 1) };
                setServices([...services, newService]);
                alert('Service record added successfully!');
            }
            resetForm();
        } catch (error) {
            console.error("Error saving service record:", error);
            alert('Error saving service record');
        }
    };

    const handleEdit = (service) => {
        setFormData(service);
        setIsEditing(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this service record?')) {
            try {
                // Simulate delete
                setServices(services.filter(s => s.id !== id));
                alert('Service record deleted successfully!');
            } catch (error) {
                console.error("Error deleting service record:", error);
                alert('Error deleting service record');
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


    if (loading) return <div className="text-center py-8">Loading Service Data...</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Service Master - DEMO MODE</h1>
            <Card title={isEditing ? 'Edit Service Record' : 'Add New Service Record'}>
                <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Select label="Customer" name="customer_id" value={formData.customer_id} onChange={handleChange} options={customerOptions} required />
                    <Select label="Product Serviced" name="product_id" value={formData.product_id} onChange={handleChange} options={productOptions} required />

                    <Input label="Service Date" name="service_date" value={formData.service_date} onChange={handleChange} required type="date" />
                    
                    <Select label="Service Type" name="service_type" value={formData.service_type} onChange={handleChange} options={serviceTypeOptions} required />
                    <Select label="Service Status" name="service_status" value={formData.service_status} onChange={handleChange} options={serviceStatusOptions} required />

                    <Input label="Next Service Date (Auto)" name="next_service_date" value={formData.next_service_date} disabled placeholder="Calculated from Product Cycle" />

                    <div className="md:col-span-3">
                        <Input label="Service Notes" name="service_notes" value={formData.service_notes} onChange={handleChange} />
                    </div>
                    <div className="md:col-span-3 flex justify-end space-x-3">
                        <Button type="submit" color="green">{isEditing ? 'Update Service' : 'Record Service'}</Button>
                        <Button type="button" onClick={resetForm} color="gray">Cancel</Button>
                    </div>
                </form>
            </Card>

            <Card title="Service History List">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Service</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {mergedServices.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{s.customer.first_name} ({s.customer.vehicle_number})</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.product.product_name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{s.service_type}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(s.service_date)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            s.service_status === 'Completed' ? 'bg-green-100 text-green-800' : 
                                            s.service_status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                            {s.service_status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-semibold">{formatDate(s.next_service_date)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                        <Button onClick={() => handleEdit(s)} color="gray" className="text-xs py-1 px-2">Edit</Button>
                                        <Button onClick={() => handleDelete(s.id)} color="red" className="text-xs py-1 px-2">Delete</Button>
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


// 5. Admin Dashboard / Notification Panel (Core Logic Demonstration)
const AdminDashboard = ({ allCustomers, allProducts, allMappings }) => {
    const [filterDays, setFilterDays] = useState(30);
    const [today, setToday] = useState('');
    const [loading, setLoading] = useState(false);

    // Reminder Tiers (Days before Expiry)
    const REMINDER_TIERS = useMemo(() => ([
        { days: 30, label: '1st Reminder (30 Days)', key: 'rem_1_sent' },
        { days: 15, label: '2nd Reminder (15 Days)', key: 'rem_2_sent' },
        { days: 1, label: 'Final Reminder (1 Day)', key: 'rem_3_sent' },
    ]), []);

    useEffect(() => {
        setToday(new Date().toISOString().split('T')[0]);
        setLoading(false);
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

            // 1. Check for Renewal Confirmation status
            if (m.reminder_status?.renewal_sent) {
                // Renewal confirmation was sent. Skip standard reminders.
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
                    mockMessage: isDue ? check.message : 'No reminder due today.'
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

    if (loading) return <div className="text-center py-8">Loading Dashboard Data...</div>;

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard & Tiered Reminders - DEMO MODE</h1>

            <Card title="Warranty Expiry Reminder Queue (Cron Simulation)" className="!p-4">
                <div className="flex justify-between items-center mb-4 p-2 bg-blue-50 rounded-lg">
                    <h3 className="text-lg font-semibold text-blue-800">Reminders Due or Expiring (Next {filterDays} Days)</h3>
                    <div className="space-x-2">
                        <Button onClick={() => setFilterDays(7)} color={filterDays === 7 ? 'blue' : 'gray'} className="text-xs py-1">Next 7 Days</Button>
                        <Button onClick={() => setFilterDays(15)} color={filterDays === 15 ? 'blue' : 'gray'} className="text-xs py-1">Next 15 Days</Button>
                        <Button onClick={() => setFilterDays(30)} color={filterDays === 30 ? 'blue' : 'gray'} className="text-xs py-1">Next 30 Days</Button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {remindersQueue.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">No tiered reminders are due within the next {filterDays} days, or all warranties have been renewed.</div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days Left</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Sent</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cron Job Action (Mock Message)</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {remindersQueue.map(m => (
                                    <tr key={m.id} className={`hover:bg-yellow-50 ${m.status.startsWith('DUE') ? 'bg-red-50' : m.status === 'Renewal Sent' ? 'bg-green-50' : ''}`}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{m.customerName}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{m.vehicleNumber}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600">{formatDate(m.expiryDate)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-500">{m.daysUntilExpiry}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                m.status.startsWith('DUE') ? 'bg-red-300 text-red-900' : m.status === 'Pending' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                                {m.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{m.lastSent}</td>
                                        <td className="px-6 py-4 text-xs text-gray-600 max-w-xs truncate">{m.mockMessage || m.details}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="mt-4 text-sm text-gray-600 p-2 border-t pt-3">
                    **CRON LOGIC:**
                    <ul>
                        <li><span className="font-semibold text-red-700">DUE</span>: Indicates a reminder (30, 15, or 1 day before expiry) is due *today* and has *not* been sent. This triggers the SMS/WA API call.</li>
                        <li><span className="font-semibold text-green-700">Renewal Sent</span>: Indicates the customer renewed, stopping all future standard reminders.</li>
                        <li><span className="font-semibold text-orange-700">Pending</span>: The warranty is expiring within the filter period, but no reminder is due today.</li>
                    </ul>
                </div>
            </Card>
        </div>
    );
};


// 8. CUSTOMER LOGS MODAL COMPONENT
const CustomerLogsModal = ({ customerId, customerName, allProducts, allLogs, onClose }) => {
    
    const logs = useMemo(() => {
        if (!customerId || !allLogs) return [];
        return allLogs
            .filter(log => log.customer_id === customerId)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [customerId, allLogs]);
    
    const getProductName = (id) => allProducts.find(p => p.id === id)?.product_name || 'N/A';
    
    // The Direct Print function (mock)
    const handlePrint = () => {
        console.log(`Printing complete logs for ${customerName}:`, logs);
        alert(`Sending detailed logs for ${customerName} to the print dialog (Print function simulated).`);
        // In a real application, this would render a print-friendly version and call window.print()
    };
    
    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b flex justify-between items-center">
                    <h3 className="text-2xl font-bold text-gray-800">Activity Log: {customerName}</h3>
                    <div className="space-x-2">
                         <Button onClick={handlePrint} color="gray" className="text-sm py-1 px-3">
                            <svg className="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m0 0v2a2 2 0 002 2h2a2 2 0 002-2v-2m4 2h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m0 0v2a2 2 0 002 2h2a2 2 0 002-2v-2m4 2h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m0 0v2a2 2 0 002 2h2a2 2 0 002-2v-2m4-10H5a2 2 0 00-2 2v4a2 2 0 002 2h2"></path></svg>
                            Print Logs
                        </Button>
                        <Button onClick={onClose} color="gray" className="p-2">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </Button>
                    </div>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-4">
                    {logs.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 border border-dashed rounded-lg">No activity logs found for this customer.</div>
                    ) : (
                        <div className="space-y-4">
                            {logs.map(log => (
                                <div key={log.id} className="p-4 border border-gray-200 rounded-lg shadow-sm bg-gray-50">
                                    <div className="flex justify-between items-start border-b pb-2 mb-2">
                                        <span className={`font-semibold text-lg ${log.action.includes('Renewal') ? 'text-green-700' : 'text-blue-700'}`}>
                                            {log.action}
                                        </span>
                                        <span className="text-sm text-gray-500">
                                            Date: <span className="font-medium">{formatDate(log.date)}</span>
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-700 mb-2">
                                        **Product:** {getProductName(log.product_id) || 'N/A'}
                                    </p>
                                    <p className="text-sm italic text-gray-600">
                                        **Notes:** {log.notes || 'No specific notes recorded.'}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="p-4 border-t flex justify-end">
                    <Button onClick={onClose} color="blue">Close</Button>
                </div>
            </div>
        </div>
    );
};


// 6. CUSTOMER MANAGEMENT VIEW (New Combined View with Add/Edit Form)
const CustomerManagementView = ({ allCustomers, allProducts, allLogs }) => {
    const [selectedLogCustomerId, setSelectedLogCustomerId] = useState(null);
    const [selectedCustomerName, setSelectedCustomerName] = useState('');
    const [showCustomerForm, setShowCustomerForm] = useState(false);
    const [formData, setFormData] = useState(initialCustomerData);
    const [isEditing, setIsEditing] = useState(false);
    const [formMessage, setFormMessage] = useState('');
    
    const customers = allCustomers;

    const handleCustomerChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSaveCustomer = async (e) => {
        e.preventDefault();
        setFormMessage('');
        
        try {
            if (isEditing) {
                // Simulate update
                setFormMessage(`Success! Customer ${formData.first_name} updated successfully.`);
                alert(`Customer ${formData.first_name} updated in DEMO MODE`);
            } else {
                // Simulate add
                const newCustomer = { ...formData, id: 'c' + (customers.length + 4) };
                setFormMessage(`Success! New customer ${formData.first_name} created. ID: ${newCustomer.id}`);
                alert(`New customer ${formData.first_name} created in DEMO MODE`);
            }
            
            resetForm();
            
        } catch (error) {
            console.error("Error saving customer:", error);
            setFormMessage(`Error: Failed to save customer.`);
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

    const handleDeleteCustomer = (id, name) => {
        if(window.confirm(`Are you sure you want to delete customer ${name}? This action is irreversible!`)) {
            alert(`Customer ${name} deleted in DEMO MODE`);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Customer Management & Logs - DEMO MODE</h1>
            
            {/* Customer Form Section */}
            {showCustomerForm && (
                <Card title={isEditing ? 'Edit Customer' : 'Add New Customer'}>
                    {formMessage && (
                        <div className={`p-3 rounded-lg mb-4 font-medium ${
                            formMessage.startsWith('Success') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                            {formMessage}
                        </div>
                    )}
                    
                    <form onSubmit={handleSaveCustomer}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Input 
                                label="First Name" 
                                name="first_name" 
                                value={formData.first_name} 
                                onChange={handleCustomerChange} 
                                required 
                            />
                            <Input 
                                label="Last Name / Surname" 
                                name="last_name" 
                                value={formData.last_name} 
                                onChange={handleCustomerChange} 
                                required 
                            />
                            <Input 
                                label="Mobile Number" 
                                name="mobile_number" 
                                value={formData.mobile_number} 
                                onChange={handleCustomerChange} 
                                required 
                                type="tel" 
                                placeholder="e.g., +919876543210" 
                            />
                            
                            <Input 
                                label="Vehicle Number" 
                                name="vehicle_number" 
                                value={formData.vehicle_number} 
                                onChange={handleCustomerChange} 
                                required 
                            />
                            <Input 
                                label="Vehicle Model" 
                                name="vehicle_model" 
                                value={formData.vehicle_model} 
                                onChange={handleCustomerChange} 
                                required 
                            />
                            <Input 
                                label="WhatsApp Number" 
                                name="whatsapp_number" 
                                value={formData.whatsapp_number} 
                                onChange={handleCustomerChange} 
                                type="tel" 
                            />
                            
                            <Input 
                                label="City" 
                                name="city" 
                                value={formData.city} 
                                onChange={handleCustomerChange} 
                            />
                            <Input 
                                label="State" 
                                name="state" 
                                value={formData.state} 
                                onChange={handleCustomerChange} 
                            />
                            
                            <div className="md:col-span-3">
                                <Input 
                                    label="Address" 
                                    name="address" 
                                    value={formData.address} 
                                    onChange={handleCustomerChange} 
                                />
                            </div>
                        </div>
                        
                        <div className="flex justify-end space-x-3 mt-6">
                            <Button type="submit" color="blue">
                                {isEditing ? 'Update Customer' : 'Save Customer'}
                            </Button>
                            <Button type="button" onClick={resetForm} color="gray">
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
                >
                    + Add New Customer
                </Button>
            </div>

            {/* Customer List */}
            <Card title="Existing Customer List">
                <p className="text-sm text-gray-500 mb-4">Total Customers: {customers.length}</p>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mobile</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {customers.map(c => (
                                <tr key={c.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{c.id.substring(0, 6)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.first_name} {c.last_name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.mobile_number}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{c.vehicle_number} ({c.vehicle_model})</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                        <Button onClick={() => handleViewLogs(c)} color="blue" className="text-xs py-1 px-3">
                                            View Logs
                                        </Button>
                                        <Button onClick={() => handleEditCustomer(c)} color="gray" className="text-xs py-1 px-3">
                                            Edit
                                        </Button>
                                        <Button onClick={() => handleDeleteCustomer(c.id, c.first_name)} color="red" className="text-xs py-1 px-3">
                                            Delete
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Log Modal */}
            {selectedLogCustomerId && (
                <CustomerLogsModal
                    customerId={selectedLogCustomerId}
                    customerName={selectedCustomerName}
                    allProducts={allProducts}
                    allLogs={allLogs}
                    onClose={handleCloseLogs}
                />
            )}
        </div>
    );
};


// 9. NEW REPORTING MODULE
// 9. NEW REPORTING MODULE
const ReportingModule = ({ allCustomers, allProducts, allMappings, allServices, allLogs }) => {
    const today = new Date().toISOString().split('T')[0];
    const [reportType, setReportType] = useState('ServiceHistory');
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [isExporting, setIsExporting] = useState(false);

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
            // Prepare worksheet data
            const wsData = [];
            
            // Add headers
            wsData.push(headers.map(h => h.label));
            
            // Add data rows
            data.forEach(row => {
                wsData.push(headers.map(header => row[header.key] || ''));
            });
            
            // Create worksheet
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            
            // Create workbook
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Report');
            
            // Generate Excel file
            XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
            
            alert(`Excel file "${filename}.xlsx" downloaded successfully!`);
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            alert('Error exporting to Excel. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    // PDF Export Function - Simple HTML to PDF approach
    const exportToPDF = (data, filename, headers) => {
        if (data.length === 0) {
            alert('No data available to export.');
            return;
        }

        setIsExporting(true);
        
        try {
            // Create HTML content
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
            
            // Create blob and download
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

        // Create print window
        const printWindow = window.open('', '_blank');
        
        // Build HTML content
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
        
        // Auto-print after content loads
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
        const end = new Date(endDate).getTime() + (24 * 60 * 60 * 1000); // End of end day

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

    // Customer Log Headers
    const customerLogHeaders = [
        { label: 'Date', key: 'date' },
        { label: 'Action', key: 'action' },
        { label: 'Product', key: 'product' },
        { label: 'Product Type', key: 'product_type' },
        { label: 'Log Type', key: 'log_type' },
        { label: 'Notes', key: 'notes' }
    ];

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">Reporting & Data Export Center - DEMO MODE</h1>

            {isExporting && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl">
                        <div className="flex items-center space-x-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                            <div className="text-lg font-medium text-gray-700">Exporting data, please wait...</div>
                        </div>
                    </div>
                </div>
            )}

            {/* 1. Customer Log Export Section */}
            <Card title="Customer Log Export & Print">
                <p className="text-sm text-gray-600 mb-4">Export the complete activity history for a specific customer.</p>
                <div className="flex space-x-4 items-end">
                    <div className="flex-1">
                        <Select 
                            label="Select Customer" 
                            name="customer_log_select" 
                            value={selectedCustomerId} 
                            onChange={(e) => setSelectedCustomerId(e.target.value)} 
                            options={customerOptions}
                            required
                        />
                    </div>
                    <Button 
                        onClick={() => exportToPDF(customerLogData, 'Customer_Log_Report', customerLogHeaders)} 
                        disabled={!selectedCustomerId || customerLogData.length === 0 || isExporting} 
                        color="red"
                    >
                        {isExporting ? 'Exporting...' : 'Export to PDF'}
                    </Button>
                    <Button 
                        onClick={() => exportToExcel(customerLogData, 'Customer_Log_Report', customerLogHeaders)} 
                        disabled={!selectedCustomerId || customerLogData.length === 0 || isExporting} 
                        color="green"
                    >
                        {isExporting ? 'Exporting...' : 'Export to Excel'}
                    </Button>
                    <Button 
                        onClick={() => handlePrint(customerLogData, 'Customer Log Report', customerLogHeaders)} 
                        disabled={!selectedCustomerId || customerLogData.length === 0 || isExporting} 
                        color="gray"
                    >
                        Direct Print
                    </Button>
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
            <Card title="System Data Reports (Filterable)">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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

                <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">
                    Report Preview: {systemReportData.data.length} Records
                    <span className="ml-2 text-sm font-normal text-gray-500">
                        ({reportType === 'ServiceHistory' ? 'Service History' : 'Warranty Expiry'})
                    </span>
                </h3>
                
                {/* Export Buttons for System Reports */}
                <div className="flex space-x-3 mb-4">
                    <Button 
                        onClick={() => exportToPDF(systemReportData.data, `${reportType}_Report`, systemReportData.columns)} 
                        disabled={systemReportData.data.length === 0 || isExporting} 
                        color="red"
                    >
                        {isExporting ? 'Exporting...' : 'Export to PDF'}
                    </Button>
                    <Button 
                        onClick={() => exportToExcel(systemReportData.data, `${reportType}_Report`, systemReportData.columns)} 
                        disabled={systemReportData.data.length === 0 || isExporting} 
                        color="green"
                    >
                        {isExporting ? 'Exporting...' : 'Export to Excel'}
                    </Button>
                    <Button 
                        onClick={() => handlePrint(systemReportData.data, `${reportType} Report`, systemReportData.columns)} 
                        disabled={systemReportData.data.length === 0 || isExporting} 
                        color="gray"
                    >
                        Direct Print
                    </Button>
                </div>

                {/* Table Preview */}
                <div className="overflow-x-auto max-h-96">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                {systemReportData.columns.slice(0, 6).map(col => (
                                    <th key={col.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        {col.label}
                                    </th>
                                ))}
                                {systemReportData.columns.length > 6 && (
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        ...
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {systemReportData.data.slice(0, 10).map((row, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                    {systemReportData.columns.slice(0, 6).map(col => (
                                        <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {row[col.key] || 'N/A'}
                                        </td>
                                    ))}
                                    {systemReportData.columns.length > 6 && (
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            ...
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
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

    // Use demo static data
    const allCustomers = demoCustomers;
    const allProducts = demoProducts;
    const allMappings = demoMappings;
    const allServices = demoServices;
    const allLogs = demoLogs;

    const renderContent = () => {
        switch (currentView) {
            case VIEWS.SALES:
                return <SalesAssignment allCustomers={allCustomers} allProducts={allProducts} allMappings={allMappings} />;
            case VIEWS.PRODUCTS:
                return <ProductMaster />;
            case VIEWS.SERVICES:
                return <ServiceMaster allCustomers={allCustomers} allProducts={allProducts} />;
            case VIEWS.CUSTOMERS:
                return <CustomerManagementView allCustomers={allCustomers} allProducts={allProducts} allLogs={allLogs} />;
            case VIEWS.REPORTS:
                return <ReportingModule allCustomers={allCustomers} allProducts={allProducts} allMappings={allMappings} allServices={allServices} allLogs={allLogs} />;
            case VIEWS.DASHBOARD:
            default:
                return <AdminDashboard allCustomers={allCustomers} allProducts={allProducts} allMappings={allMappings} />;
        }
    };

    const NavItem = ({ view }) => (
        <button
            onClick={() => setCurrentView(view)}
            className={`px-4 py-2 rounded-lg font-medium transition duration-150 text-sm ${
                currentView === view
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-700 hover:bg-gray-100'
            }`}
        >
            {view}
        </button>
    );

    return (
        <div className="min-h-screen bg-gray-50 font-sans antialiased flex flex-col">
            <header className="bg-white shadow-md sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div className="text-2xl font-extrabold text-blue-800 flex items-center">
                        <svg className="w-6 h-6 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                       Umiya Tank Testing Plant
                    </div>
                    <nav className="hidden md:flex space-x-2">
                        <NavItem view={VIEWS.DASHBOARD} />
                        <NavItem view={VIEWS.SALES} />
                        <NavItem view={VIEWS.CUSTOMERS} />
                        <NavItem view={VIEWS.PRODUCTS} />
                        <NavItem view={VIEWS.SERVICES} />
                        <NavItem view={VIEWS.REPORTS} />
                    </nav>
                </div>
                <div className="md:hidden p-2 bg-gray-100 flex justify-center space-x-2 overflow-x-auto">
                    <NavItem view={VIEWS.DASHBOARD} />
                    <NavItem view={VIEWS.SALES} />
                    <NavItem view={VIEWS.CUSTOMERS} />
                    <NavItem view={VIEWS.PRODUCTS} />
                    <NavItem view={VIEWS.SERVICES} />
                    <NavItem view={VIEWS.REPORTS} />
                </div>
            </header>

            <main className="max-w-7xl mx-auto py-8 sm:px-6 lg:px-8 w-full flex-grow">
                {renderContent()}
            </main>

            <footer className="w-full bg-gray-800 text-white text-center p-4 text-xs mt-8">
                <p>CNG Kit ERP - Warranty & Service Management System </p>
            </footer>
        </div>
    );
};

export default App;
