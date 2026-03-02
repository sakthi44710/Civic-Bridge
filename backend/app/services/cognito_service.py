"""
AWS Cognito Service - Google OAuth Integration
Handles user pool management and federated identity with Google
"""
import logging
from typing import Optional, Dict
import boto3
from botocore.exceptions import ClientError
from app.config import settings

logger = logging.getLogger(__name__)

# Lazy Cognito client initialization
_cognito_client = None


def _get_cognito_client():
    """Lazy Cognito Identity Provider client initialization"""
    global _cognito_client
    if _cognito_client is not None:
        return _cognito_client
    
    try:
        _cognito_client = boto3.client(
            'cognito-idp',
            region_name=settings.COGNITO_REGION or settings.AWS_REGION
        )
        logger.info("Cognito client initialized")
        return _cognito_client
    except Exception as e:
        logger.error(f"Failed to initialize Cognito client: {e}")
        return None


class CognitoService:
    """AWS Cognito service for Google OAuth integration"""
    
    def __init__(self):
        self.client = None
        self.user_pool_id = settings.COGNITO_USER_POOL_ID
        self.client_id = settings.COGNITO_CLIENT_ID
        self.client_secret = settings.COGNITO_CLIENT_SECRET
    
    def _ensure_client(self):
        """Ensure Cognito client is initialized"""
        if not self.client:
            self.client = _get_cognito_client()
        return self.client is not None
    
    def authenticate_google_user(self, access_token: str) -> Optional[Dict]:
        """
        Authenticate user with Google access token via Cognito
        
        Args:
            access_token: Google OAuth access token
            
        Returns:
            User data dict with Cognito tokens, or None if failed
        """
        if not self._ensure_client():
            logger.warning("Cognito client not available")
            return None
        
        try:
            # Initiate auth with Google token
            response = self.client.initiate_auth(
                ClientId=self.client_id,
                AuthFlow='CUSTOM_AUTH',
                AuthParameters={
                    'USERNAME': access_token,
                    'PROVIDER': 'Google'
                }
            )
            
            if 'AuthenticationResult' in response:
                auth_result = response['AuthenticationResult']
                
                # Get user attributes
                user_info = self.get_user_info(auth_result['AccessToken'])
                
                return {
                    'id_token': auth_result.get('IdToken'),
                    'access_token': auth_result.get('AccessToken'),
                    'refresh_token': auth_result.get('RefreshToken'),
                    'user_info': user_info
                }
        except ClientError as e:
            logger.error(f"Cognito authentication failed: {e}")
        except Exception as e:
            logger.error(f"Unexpected error in Cognito auth: {e}")
        
        return None
    
    def get_user_info(self, access_token: str) -> Optional[Dict]:
        """
        Get user information from Cognito access token
        
        Args:
            access_token: Cognito access token
            
        Returns:
            User attributes dict
        """
        if not self._ensure_client():
            return None
        
        try:
            response = self.client.get_user(AccessToken=access_token)
            
            # Parse user attributes
            attributes = {}
            for attr in response.get('UserAttributes', []):
                attributes[attr['Name']] = attr['Value']
            
            return {
                'username': response.get('Username'),
                'email': attributes.get('email'),
                'name': attributes.get('name'),
                'picture': attributes.get('picture'),
                'email_verified': attributes.get('email_verified') == 'true',
                'sub': attributes.get('sub'),
            }
        except ClientError as e:
            logger.error(f"Failed to get user info: {e}")
        except Exception as e:
            logger.error(f"Unexpected error getting user info: {e}")
        
        return None
    
    def create_user_pool(self, pool_name: str = "CivicBridge-Users") -> Optional[str]:
        """
        Create a new Cognito User Pool with Google OAuth configuration
        
        Args:
            pool_name: Name for the user pool
            
        Returns:
            User pool ID if successful, None otherwise
        """
        if not self._ensure_client():
            return None
        
        try:
            response = self.client.create_user_pool(
                PoolName=pool_name,
                Policies={
                    'PasswordPolicy': {
                        'MinimumLength': 8,
                        'RequireUppercase': False,
                        'RequireLowercase': False,
                        'RequireNumbers': False,
                        'RequireSymbols': False,
                    }
                },
                AutoVerifiedAttributes=['email'],
                UsernameAttributes=['email'],
                Schema=[
                    {
                        'Name': 'email',
                        'AttributeDataType': 'String',
                        'Required': True,
                        'Mutable': True,
                    },
                    {
                        'Name': 'name',
                        'AttributeDataType': 'String',
                        'Required': False,
                        'Mutable': True,
                    },
                    {
                        'Name': 'picture',
                        'AttributeDataType': 'String',
                        'Required': False,
                        'Mutable': True,
                    },
                ],
                UserPoolTags={
                    'Application': 'CivicBridge',
                    'Environment': settings.ENVIRONMENT,
                }
            )
            
            user_pool_id = response['UserPool']['Id']
            logger.info(f"Created Cognito User Pool: {user_pool_id}")
            return user_pool_id
        except ClientError as e:
            logger.error(f"Failed to create user pool: {e}")
        except Exception as e:
            logger.error(f"Unexpected error creating user pool: {e}")
        
        return None
    
    def create_user_pool_client(
        self, 
        user_pool_id: str,
        client_name: str = "CivicBridge-Web"
    ) -> Optional[Dict]:
        """
        Create a user pool client for the application
        
        Args:
            user_pool_id: Cognito User Pool ID
            client_name: Name for the client
            
        Returns:
            Client configuration dict
        """
        if not self._ensure_client():
            return None
        
        try:
            response = self.client.create_user_pool_client(
                UserPoolId=user_pool_id,
                ClientName=client_name,
                GenerateSecret=True,
                RefreshTokenValidity=30,
                AccessTokenValidity=1,
                IdTokenValidity=1,
                TokenValidityUnits={
                    'AccessToken': 'hours',
                    'IdToken': 'hours',
                    'RefreshToken': 'days',
                },
                ReadAttributes=['email', 'name', 'picture'],
                WriteAttributes=['name', 'picture'],
                ExplicitAuthFlows=[
                    'ALLOW_REFRESH_TOKEN_AUTH',
                    'ALLOW_USER_SRP_AUTH',
                    'ALLOW_CUSTOM_AUTH',
                ],
                SupportedIdentityProviders=['Google'],
                CallbackURLs=[
                    'http://localhost:5173/auth/callback',
                    'https://civicbridge.in/auth/callback',
                ],
                LogoutURLs=[
                    'http://localhost:5173/',
                    'https://civicbridge.in/',
                ],
                AllowedOAuthFlows=['code', 'implicit'],
                AllowedOAuthScopes=['email', 'openid', 'profile'],
                AllowedOAuthFlowsUserPoolClient=True,
            )
            
            client_id = response['UserPoolClient']['ClientId']
            client_secret = response['UserPoolClient'].get('ClientSecret')
            
            logger.info(f"Created User Pool Client: {client_id}")
            return {
                'client_id': client_id,
                'client_secret': client_secret,
            }
        except ClientError as e:
            logger.error(f"Failed to create user pool client: {e}")
        except Exception as e:
            logger.error(f"Unexpected error creating client: {e}")
        
        return None
    
    def configure_google_identity_provider(
        self,
        user_pool_id: str,
        google_client_id: str,
        google_client_secret: str
    ) -> bool:
        """
        Configure Google as an identity provider for the user pool
        
        Args:
            user_pool_id: Cognito User Pool ID
            google_client_id: Google OAuth Client ID
            google_client_secret: Google OAuth Client Secret
            
        Returns:
            True if successful, False otherwise
        """
        if not self._ensure_client():
            return False
        
        try:
            self.client.create_identity_provider(
                UserPoolId=user_pool_id,
                ProviderName='Google',
                ProviderType='Google',
                ProviderDetails={
                    'client_id': google_client_id,
                    'client_secret': google_client_secret,
                    'authorize_scopes': 'email openid profile',
                },
                AttributeMapping={
                    'email': 'email',
                    'name': 'name',
                    'picture': 'picture',
                    'username': 'sub',
                }
            )
            
            logger.info(f"Configured Google identity provider for pool: {user_pool_id}")
            return True
        except ClientError as e:
            if e.response['Error']['Code'] == 'DuplicateProviderException':
                logger.info("Google identity provider already exists")
                return True
            logger.error(f"Failed to configure Google provider: {e}")
        except Exception as e:
            logger.error(f"Unexpected error configuring Google provider: {e}")
        
        return False
    
    def get_hosted_ui_url(self) -> Optional[str]:
        """
        Get the Cognito Hosted UI URL for Google OAuth
        
        Returns:
            Hosted UI URL string
        """
        if not settings.COGNITO_DOMAIN or not self.client_id:
            logger.warning("Cognito domain or client ID not configured")
            return None
        
        domain = settings.COGNITO_DOMAIN
        client_id = self.client_id
        redirect_uri = "http://localhost:5173/auth/callback"  # Update for production
        
        url = (
            f"https://{domain}.auth.{settings.COGNITO_REGION}.amazoncognito.com/oauth2/authorize"
            f"?client_id={client_id}"
            f"&response_type=code"
            f"&scope=email+openid+profile"
            f"&redirect_uri={redirect_uri}"
            f"&identity_provider=Google"
        )
        
        return url


# Singleton instance
cognito_service = CognitoService()
