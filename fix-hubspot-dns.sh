#!/bin/bash
echo "Adding temporary HubSpot API resolution to /etc/hosts"
echo "This requires sudo access"
echo ""
echo "104.18.243.108 api.hubapi.com" | sudo tee -a /etc/hosts
echo "Done! HubSpot API should now be accessible"
echo ""
echo "To remove this later, edit /etc/hosts and remove the line with api.hubapi.com"