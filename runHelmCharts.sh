set -e

cd buildConcreteDetection

# Build all apps
cd imageUpload
sh buildImageUploadImage.sh

cd ../crackDetection
sh buildCrackDetectionImage.sh

cd ../concreteImageGallery

echo "Push the concreteGallery docker image"
sh buildConcreteGalleryImage.sh

echo "Coming to root dir"
cd ../..
echo "Create nfs-server helm chart"
helm upgrade --install nfs-server ./nfsserverChart

sleep 3
NFS_CIP=$(kubectl get svc nfs-server-svc-cip -o jsonpath='{.spec.clusterIP}')
if [[ -z "$NFS_CIP" ]]; then
  echo "ERROR: could not discover nfs-server-svc-cip ClusterIP" >&2
  exit 1
fi
echo "NFS ClusterIP: $NFS_CIP"
sleep 3

VALUES_FILE="${VALUES_FILE:-./masterChart/values.yaml}"
echo "Running master-chart using values: $VALUES_FILE"
kubectl delete validatingwebhookconfiguration ingress-nginx-admission --ignore-not-found=true 2>/dev/null || true
kubectl delete validatingwebhookconfigurations -l app.kubernetes.io/name=ingress-nginx --ignore-not-found=true 2>/dev/null || true
helm upgrade --install master-chart ./masterChart -f "$VALUES_FILE" --set pv-chart.nfsCIP="$NFS_CIP" --set global.registry="${DOCKER_USER_ID:-maheshrajannan}"



echo "================================================"
echo "Waiting for Ingress IP to be provisioned..."
echo "================================================"
INGRESS_IP=""
while [ -z "$INGRESS_IP" ]; do
    sleep 5
    INGRESS_IP=$(kubectl get ingress concrete-gallery-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
    if [ -z "$INGRESS_IP" ]; then
        INGRESS_IP=$(kubectl get ingress concrete-gallery-ingress -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)
    fi
done

DOMAIN_NAME=$(kubectl get ingress concrete-gallery-ingress -o jsonpath='{.spec.rules[0].host}')
echo "================================================"
echo "SUCCESS: Ingress attached to External IP!"
echo "  Domain        : $DOMAIN_NAME"
echo "  External IP   : $INGRESS_IP"
echo "  Gallery URL   : https://$DOMAIN_NAME/"
echo "  Upload URL    : https://$DOMAIN_NAME/upload"
echo "================================================"