import React, { useState } from 'react';

const AuthForm = () => {
  // State to toggle between 'login' and 'register' view
  const [isLogin, setIsLogin] = useState(true);
  
  // State to store form input values
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });

  // Handler for all input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevData => ({
      ...prevData,
      [name]: value,
    }));
  };

  // Handler for form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (isLogin) {
      console.log('Logging in with:', formData.email, formData.password);
      // **TODO: Add actual login API call here**
    } else {
      console.log('Registering with:', formData.username, formData.email, formData.password);
      // **TODO: Add actual registration API call here**
    }
    
    // Reset the form after submission (optional)
    setFormData({ username: '', email: '', password: '' });
  };

  // --- Render Logic ---
  return (
    <div style={styles.container}>
      <h2>{isLogin ? 'Login' : 'Register'}</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        
        {/* Username field only for Register view */}
        {!isLogin && (
          <input
            type="text"
            name="username"
            placeholder="Username"
            value={formData.username}
            onChange={handleChange}
            required
            style={styles.input}
          />
        )}
        
        {/* Email field for both views */}
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          required
          style={styles.input}
        />
        
        {/* Password field for both views */}
        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          required
          style={styles.input}
        />
        
        {/* Submit button */}
        <button type="submit" style={styles.button}>
          {isLogin ? 'Login' : 'Register'}
        </button>
      </form>

      {/* Toggle link */}
      <p style={styles.toggleText}>
        {isLogin ? "Don't have an account? " : "Already have an account? "}
        <span 
          onClick={() => setIsLogin(!isLogin)} 
          style={styles.toggleLink}
        >
          {isLogin ? 'Register here' : 'Login here'}
        </span>
      </p>
    </div>
  );
};

// --- Basic Inline Styles (You'd use a CSS file in a real app) ---
const styles = {
  container: {
    maxWidth: '400px',
    margin: '50px auto',
    padding: '20px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    textAlign: 'center',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    marginTop: '20px',
  },
  input: {
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid #ddd',
  },
  button: {
    padding: '10px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  toggleText: {
    marginTop: '20px',
    fontSize: '14px',
  },
  toggleLink: {
    color: '#007bff',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
};

export default AuthForm;