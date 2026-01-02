package auth

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const JWTSecret = "poc-secret-key-do-not-use-in-production"

// Claims represents JWT claims
type Claims struct {
	Sub    string `json:"sub"`
	Role   string `json:"role"`
	Agency string `json:"agency"`
	jwt.RegisteredClaims
}

// User represents a hardcoded user for PoC
type User struct {
	ID       string
	Password string
	Role     string // "citizen" or "officer"
	Agency   string // e.g., "AGENCY_INFRA", "AGENCY_HEALTH"
}

// Hardcoded users for PoC
var Users = map[string]User{
	"citizen1": {ID: "citizen1", Password: "password", Role: "citizen", Agency: ""},
	"citizen2": {ID: "citizen2", Password: "password", Role: "citizen", Agency: ""},
	"citizen3": {ID: "citizen3", Password: "password", Role: "citizen", Agency: ""},
	"officer1": {ID: "officer1", Password: "password", Role: "officer", Agency: "AGENCY_INFRA"},
	"officer2": {ID: "officer2", Password: "password", Role: "officer", Agency: "AGENCY_HEALTH"},
	"officer3": {ID: "officer3", Password: "password", Role: "officer", Agency: "AGENCY_SAFETY"},
}

// Agency routing based on category
var CategoryToAgency = map[string]string{
	"infrastruktur": "AGENCY_INFRA",
	"kesehatan":     "AGENCY_HEALTH",
	"keamanan":      "AGENCY_SAFETY",
	"kebersihan":    "AGENCY_INFRA",
	"kriminalitas":  "AGENCY_SAFETY",
	"lainnya":       "AGENCY_INFRA",
}

// GenerateToken creates a JWT token for a user
func GenerateToken(user User) (string, error) {
	claims := Claims{
		Sub:    user.ID,
		Role:   user.Role,
		Agency: user.Agency,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(JWTSecret))
}

// ValidateToken validates and parses a JWT token
func ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(JWTSecret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

// ExtractTokenFromHeader extracts token from Authorization header
func ExtractTokenFromHeader(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return ""
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return ""
	}

	return parts[1]
}

// Authenticate validates credentials and returns user
func Authenticate(username, password string) (*User, error) {
	user, exists := Users[username]
	if !exists || user.Password != password {
		return nil, errors.New("invalid credentials")
	}
	return &user, nil
}

// GetAgencyForCategory returns the agency responsible for a category
func GetAgencyForCategory(category string) string {
	if agency, exists := CategoryToAgency[category]; exists {
		return agency
	}
	return "AGENCY_INFRA" // default
}
